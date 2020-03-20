import * as libcp from 'child_process';
import * as libcrypto from 'crypto';
import * as libpath from 'path';
import * as libfs from 'fs';
import * as libdt from './delete_tree';
import { MediaContent, MediaType, EpisodeContent, MovieContent } from './discdb';
import * as stream_types from "./stream_types";
import * as ffprobe from "./ffprobe";
import * as queue_metadata from "./queue_metadata";
import * as job from "./job";
import * as utils from "./utils";

let sdb = queue_metadata.Database.as(JSON.parse(libfs.readFileSync('./private/db/queue_metadata.json', "utf8")));

interface Callback<A> {
	(value: A): void
}

let gcd = (a: number, b: number): number => {
	if (!b) {
		return a;
	}
	return gcd(b, a % b);
};

let save_queue_metadata = (cb: { (): void }): void => {
	let stats = sdb;
	let sorted = new Array<{ key: string, value: any }>();
	for (let key of Object.keys(stats)) {
		sorted.push({
			key: key,
			value: stats[key]
		});
	}
	sorted = sorted.sort((a, b) => {
		if (a.key < b.key) {
			return -1;
		}
		if (a.key > b.key) {
			return 1;
		}
		return 0;
	});
	let out: Record<string, any> = {};
	sorted.forEach((entry) => {
		out[entry.key] = entry.value;
	});
	let fd = libfs.openSync('./private/db/queue_metadata.json', 'w');
	libfs.writeSync(fd, JSON.stringify(out, null, `\t`));
	libfs.closeSync(fd);
	cb();
};

type FormatDetectResult = {
	dimx: number;
	dimy: number;
	parx: number;
	pary: number;
	darx: number;
	dary: number;
	farx: number;
	fary: number;
	fpsx: number;
	fpsy: number;
	color_range: string | null;
	color_space: string | null;
	color_transfer: string | null;
	color_primaries: string | null;
};

let format_detect = (path: string, cb: { (result: FormatDetectResult): void }): void => {
	console.log(`Determining format...`);
	libcp.exec(`ffprobe -v quiet -print_format json -show_streams ${path}`, (error, stdout, stderr) => {
		let json = JSON.parse(stdout);
		for (let i = 0; json.streams && i < json.streams.length; i++) {
			let stream = json.streams[i];
			if (stream.codec_type === 'video') {
				let divisor = gcd(stream.width, stream.height);
				let result = {
					dimx: stream.width,
					dimy: stream.height,
					parx: parseInt(stream.sample_aspect_ratio.split(':')[0]),
					pary: parseInt(stream.sample_aspect_ratio.split(':')[1]),
					darx: parseInt(stream.display_aspect_ratio.split(':')[0]),
					dary: parseInt(stream.display_aspect_ratio.split(':')[1]),
					farx: (stream.width / divisor),
					fary: (stream.height / divisor),
					fpsx: parseInt(stream.r_frame_rate.split('/')[0]),
					fpsy: parseInt(stream.r_frame_rate.split('/')[1]),
					color_range: stream.color_range || null,
					color_space: stream.color_space || null,
					color_transfer: stream.color_transfer || null,
					color_primaries: stream.color_primaries || null
				};
				if (result.parx === 186 && result.pary === 157 && result.darx === 279 && result.dary === 157) {
					result.parx = 32;
					result.pary = 27;
					result.darx = 16;
					result.dary = 9;
				}
				console.log(result);
				cb(result);
				break;
			}
		}
	});
};

let interlace_detect = (path: string, cb: { (imode: queue_metadata.FieldOrder): void }): void => {
	console.log(`Detecting interlace mode...`);
	libcp.execFile('ffmpeg', [
		'-i', path,
		'-vf', `select='between(mod(n\\,15000)\\,0\\,1499)',idet`,
		'-vsync', '0',
		'-an',
		'-f', 'null',
		'-'
	], (error, stdout, stderr) => {
		let re;
		let parts;
		let imode = 'progressive' as queue_metadata.FieldOrder;
		re = /\[Parsed_idet_[0-9]+\s+@\s+[0-9a-fA-F]{16}\]\s+Multi\s+frame\s+detection:\s+TFF:\s*([0-9]+)\s+BFF:\s*([0-9]+)\s+Progressive:\s*([0-9]+)\s+Undetermined:\s*([0-9]+)/;
		parts = re.exec(stderr);
		if (parts !== null) {
			let tff = parseInt(parts[1]);
			let bff = parseInt(parts[2]);
			let prog = parseInt(parts[3]);
			let undet = parseInt(parts[4]);
			let sum = tff + bff + prog + undet;
			if (tff > bff && tff > sum*0.20) {
				imode = 'tff';
			} else if (bff > tff && bff > sum*0.20) {
				imode = 'bff';
			} else {
				imode = 'progressive';
			}
		}
		console.log(imode);
		cb(imode);
	});
};

type CropResult = {
	w: number;
	h: number;
	x: number;
	y: number;
	darx: number;
	dary: number;
};

let crop_detect = (path: string, picture: FormatDetectResult, cb: { (crop: queue_metadata.CropSettings): void }): void => {
	console.log(`Detecting crop settings...`);
	libcp.execFile('ffmpeg', [
		'-i', `${path}`,
		'-vf', 'framestep=250,crop=iw-4:ih-4,bbox=24',
		'-an',
		'-f', 'null',
		'-'
	], (error, stdout, stderr) => {
		let re;
		let parts;
		let x1s = new Array(picture.dimx - 4).fill(0);
		let x2s = new Array(picture.dimx - 4).fill(0);
		let y1s = new Array(picture.dimy - 4).fill(0);
		let y2s = new Array(picture.dimy - 4).fill(0);
		re = /\[Parsed_bbox_[0-9]+\s+@\s+[0-9a-fA-F]{16}\]\s+n:[0-9]+\s+pts:[0-9]+\s+pts_time:[0-9]+(?:\.[0-9]+)?\s+x1:([0-9]+)\s+x2:([0-9]+)\s+y1:([0-9]+)\s+y2:([0-9]+)/g;
		let samples = 0;
		while ((parts = re.exec(stderr)) !== null) {
			samples++;
			let x1 = parseInt(parts[1]);
			let x2 = parseInt(parts[2]);
			let y1 = parseInt(parts[3]);
			let y2 = parseInt(parts[4]);
			x1s[x1]++;
			x2s[x2]++;
			y1s[y1]++;
			y2s[y2]++;
		}
		if (samples === 0) {
			throw new Error();
		}
		let crop = {
			x1: 0,
			x2: (picture.dimx - 4),
			y1: 0,
			y2: (picture.dimy - 4)
		};
		for (let i = 0, sum = 0; i < x1s.length && sum < 0.75*samples; i++) {
			crop.x1 = i;
			sum += x1s[i];
		}
		for (let i = x2s.length - 1, sum = 0; i >= 0 && sum < 0.75*samples; i--) {
			crop.x2 = i;
			sum += x2s[i];
		}
		for (let i = 0, sum = 0; i < y1s.length && sum < 0.75*samples; i++) {
			crop.y1 = i;
			sum += y1s[i];
		}
		for (let i = y2s.length - 1, sum = 0; i >= 0 && sum < 0.75*samples; i--) {
			crop.y2 = i;
			sum += y2s[i];
		}
		crop.x1 += 2;
		crop.x2 += 2;
		crop.y1 += 2;
		crop.y2 += 2;
		crop.x1 += 4;
		crop.x2 -= 4;
		crop.y1 += 4;
		crop.y2 -= 4;
		let w = (crop.x2 - crop.x1 + 1);
		let h = (crop.y2 - crop.y1 + 1);
		let ar = (w*picture.parx/picture.pary/h);
		let candidates = [
			{ w: 64, h: 27 },
			{ w: 16, h: 9 },
			{ w: 4, h: 3 }
		];
		let deltas = candidates.map((candidate) => {
			return {
				...candidate,
				delta: Math.abs(candidate.w/candidate.h - ar)
			};
		}).sort((a, b) => {
			if (a.delta < b.delta) return -1;
			if (a.delta > b.delta) return 1;
			return 0;
		});
		let darx = deltas[0].w;
		let dary = deltas[0].h;
		let dimx = darx*picture.pary;
		let dimy = dary*picture.parx;
		let dim_gcd = gcd(dimx, dimy);
		let cx = dimx / dim_gcd;
		let cy = dimy / dim_gcd;
		let virtualw = picture.dimx*cx/picture.farx;
		let virtualh = picture.dimy*cy/picture.fary;
		let tx = ((virtualw - w) / cx);
		let ty = ((virtualh - h) / cy);
		let t = tx > ty ? tx : ty;
		t = Math.ceil(t * 0.5) << 1;
		let nw = (virtualw - t*cx);
		let nh = (virtualh - t*cy);
		let mx = crop.x1 + (w * 0.5) - (nw * 0.5);
		let my = crop.y1 + (h * 0.5) - (nh * 0.5);
		let final = {
			w: nw,
			h: nh,
			x: mx | 0,
			y: my | 0
		};
		console.log(final);
		cb(final);
	});
};

let create_temp_dir = (cb: { (wd: string, id: string): void }): void => {
	let id = libcrypto.randomBytes(16).toString('hex');
	let wd = libpath.join('./private/temp/', id);
	libfs.mkdirSync(wd, { recursive: true });
	cb(wd, id);
};

let get_frame_size = (k: number, farx: number, fary: number): { w: number, h: number } => {
	let hw = 64 * k;
	let hh = hw * 9 / 16;
	// Reduce height for frames with 64:27 aspect ratio.
	if (farx * 9 > 16 * fary) {
		hh = hw * fary / farx;
	}
	// Reduce width for frames with 4:3 aspect ratio.
	if (farx * 9 < 16 * fary) {
		hw = hh * farx / fary;
	}
	let w = (hw << 1);
	let h = (hh << 1);
	return {
		w,
		h
	};
};

let encode_hardware = (
	filename: string,
	outfile: string,
	picture: FormatDetectResult,
	rect: queue_metadata.CropSettings,
	imode: queue_metadata.FieldOrder,
	compressibility: number,
	audio_streams: Array<stream_types.AudioStream>,
	cb: { (outfile: string): void },
	sample_cadance: number,
	sample_keep: number,
	extraopts: Array<string>,
	overrides: Array<string>,
	video_stream: stream_types.VideoStream,
	opt_content: MediaContent | null = null
): void => {
	picture = {...picture};
	let is_dvd_pal = picture.dimx === 720 && picture.dimy === 576 && picture.fpsx === 25 && picture.fpsy === 1;
	let is_dvd_ntsc = picture.dimx === 720 && picture.dimy === 480 && picture.fpsx === 30000 && picture.fpsy === 1001;
	let is_fhd = picture.dimx === 1920 && picture.dimy === 1080;
	if (is_dvd_pal) {
		picture.color_space = picture.color_space || 'bt470bg';
		picture.color_transfer = picture.color_transfer || 'smpte170m';
		picture.color_primaries = picture.color_primaries || 'bt470bg';
		picture.color_range = picture.color_range || 'tv';
	} else if (is_dvd_ntsc) {
		picture.color_space = picture.color_space || 'smpte170m';
		picture.color_transfer = picture.color_transfer || 'smpte170m';
		picture.color_primaries = picture.color_primaries || 'smpte170m';
		picture.color_range = picture.color_range || 'tv';
	} else {
		picture.color_space = picture.color_space || 'bt709';
		picture.color_transfer = picture.color_transfer || 'bt709';
		picture.color_primaries = picture.color_primaries || 'bt709';
		picture.color_range = picture.color_range || 'tv';
	}
	let md = new Array<string>();
	if (opt_content != null) {
		if (EpisodeContent.is(opt_content)) {
			md = [
				'-metadata', `title=${opt_content.title}`,
				'-metadata', `show=${opt_content.show}`,
				'-metadata', `season_number=${opt_content.season}`,
				'-metadata', `episode_sort=${opt_content.episode}`,
				'-metadata', `episode_id=${opt_content.title}`,
				"-metadata", "comment=" + JSON.stringify({ imdb: opt_content.imdb })
			];
		} else if (MovieContent.is(opt_content)) {
			md = [
				'-metadata', `title=${opt_content.title}`,
				'-metadata', `date=${opt_content.year}`,
				"-metadata", "comment=" + JSON.stringify({ imdb: opt_content.imdb })
			];
		}
	}
	md.push("-metadata:s:v:0", "language=" + video_stream.tags.language);
	audio_streams.forEach((audio_stream, index) => {
		md.push("-metadata:s:a:" + index, "language=" + audio_stream.tags.language);
	});
	let interlace = '';
	if (imode === 'tff') {
		interlace = 'yadif=0:0:0,';
	} else if (imode === 'bff') {
		interlace = 'yadif=0:1:0,';
	}
	let frame_size = get_frame_size(is_fhd ? 15 : 8, picture.parx * rect.w, picture.pary * rect.h);
	let frameselect = `select='between(mod(n\\,${sample_cadance})\\,0\\,${sample_keep - 1})',`;
	let cp = libcp.spawn('ffmpeg', [
		...extraopts,
		'-i', filename,
		'-vf', `format=yuv420p16le,${interlace}${frameselect}crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},hqdn3d=1:1:5:5,scale=${frame_size.w}:${frame_size.h}`,
		'-an',
		'-v', 'quiet',
		'-f', 'rawvideo',
		'pipe:'
	]);
	let mbx = ((frame_size.w + 16 - 1) / 16) | 0;
	let mby = ((frame_size.h + 16 - 1) / 16) | 0;
	let ref = (32768 / mbx / mby) | 0;
	ref = (ref > 16) ? 16 : ref;
	let x264 = `me=umh:subme=10:ref=${ref}:me-range=24:chroma-me=1:bframes=8:crf=20:nr=0:psy=1:psy-rd=1.0,1.0:trellis=2:dct-decimate=0:qcomp=0.6:deadzone-intra=0:deadzone-inter=0:fast-pskip=1:aq-mode=1:aq-strength=1.0:colorprim=${picture.color_primaries}:transfer=${picture.color_transfer}:colormatrix=${picture.color_space}`;
	let strength = Math.max(0.0, Math.min((1.0 - compressibility) * 0.1, 1.0));
	let cpx = libcp.spawn('denice', ['yuv420p16le', `${frame_size.w}`, `${frame_size.h}`, `${strength}`], { cwd: '../denice/build/' });
	let cp2 = libcp.spawn('ffmpeg', [
		'-f', 'rawvideo',
		'-pix_fmt', 'yuv420p16le',
		'-s', `${frame_size.w}:${frame_size.h}`,
		'-r', `${picture.fpsx}/${picture.fpsy}`,
		'-i', 'pipe:',
		...extraopts,
		'-i', filename,
		'-map', '0:0',
		...audio_streams.map((audio_stream) => {
			return ["-map", "1:" + audio_stream.index];
		}).reduce((previous, current) => {
			previous.push(...current);
			return previous;
		}, []),
		'-f', 'mp4',
		'-map_chapters', '-1',
		'-map_metadata', '-1',
		'-fflags', '+bitexact',
		'-movflags', '+faststart',
		'-vf', `gradfun=1:16`,
		'-c:v', 'libx264',
		'-preset', 'veryslow',
		'-x264-params', x264,
		'-ac', '2',
		'-c:a', 'aac',
		'-q:a', '2',
		...md,
		...overrides,
		outfile,
		'-y'
	]);
	cp.stdout.pipe(cpx.stdin);
	cp.stderr.pipe(process.stderr);
	cpx.stderr.pipe(process.stderr);
	cpx.stdout.pipe(cp2.stdin);
	cp2.stdout.pipe(process.stdout);
	cp2.stderr.pipe(process.stderr);
	cp2.on('exit', () => {
		cb(outfile);
	});
};

let compute_compressibility = (filename: string, picture: FormatDetectResult, rect: queue_metadata.CropSettings, imode: queue_metadata.FieldOrder, cb: Callback<number>): void => {
	let id1 = libcrypto.randomBytes(16).toString("hex");
	let id2 = libcrypto.randomBytes(16).toString("hex");
	let frames = 1;
	ffprobe.getVideoStreamsToKeep(filename, (video_streams) => {
		const stream = video_streams.shift();
		if (stream == null) {
			throw "";
		}
		create_temp_dir((wd, id) => {
			encode_hardware(filename, libpath.join(wd, id1), picture, rect, imode, 1.0, [], (outfile1) => {
				encode_hardware(filename, libpath.join(wd, id2), picture, rect, imode, 1.0, [], (outfile2) => {
					let s1 = libfs.statSync(outfile1).size;
					let s2 = libfs.statSync(outfile2).size;
					let c = 1.0 - (s2 - s1)/(frames * s1);
					libdt.async(wd, () => {
						cb(Math.max(0.0, Math.min(c, 1.0)));
					});
				}, 250, 1 + frames, [ "-vsync", "0" ], [ "-f", "h264" ], stream);
			}, 250, 1, [ "-vsync", "0" ], [ "-f", "h264" ], stream);
		});
	});
};

let determine_metadata = (filename: string, cb: Callback<{ picture: FormatDetectResult, settings: queue_metadata.Setting }>): void => {
	format_detect(filename, (picture) => {
		crop_detect(filename, picture, (crop) => {
			interlace_detect(filename, (field_order) => {
				compute_compressibility(filename, picture, crop, field_order, (compressibility) => {
					cb({
						picture,
						settings: {
							crop,
							field_order,
							compressibility
						}
					});
				});
			});
		});
	});
};

let get_metadata = (filename: string, cb: Callback<{ picture: FormatDetectResult, settings: queue_metadata.Setting }>, basename: string): void => {
	let parts = libpath.basename(filename).split(".");
	let key = parts.slice(0, -1).join(".");
	process.stderr.write(`Database key: ${key}\n`);
	const md = sdb[key];
	if (md != undefined) {
		format_detect(filename, (format) => {
			cb({
				picture: format,
				settings: md
			});
		});
	} else {
		determine_metadata(filename, (md) => {
			sdb[key] = md.settings;
			save_queue_metadata(() => {
				cb(md);
			});
		});
	}
};

function getArtifactPath(stream: stream_types.VideoStream, basename: string): string {
	return `${basename}.mp4`;
}

function transcodeSingleStream(path: string, stream: stream_types.VideoStream, basename: string, content: MediaContent, cb: Callback<string>): void {
	let outfile = getArtifactPath(stream, basename);
	get_metadata(path, (md) => {
		let extraopts = new Array<string>()
		extraopts = ['-ss', '0:15:00', '-t', '60'];
		ffprobe.getAudioStreamsToKeep(path, (audio_streams) => {
			encode_hardware(path, outfile, md.picture, md.settings.crop, md.settings.field_order, md.settings.compressibility, audio_streams, cb, 1, 1, extraopts, [], stream, content);
		});
	}, basename);
}

function generateJobs(path: string, type: MediaType, content: MediaContent, cb: Callback<Array<job.Job>>) {
	let basename = utils.getBasename(type, content);
	ffprobe.getVideoStreamsToKeep(path, (video_streams) => {
		let jobs = new Array<job.Job>();
		for (let stream of video_streams) {
			jobs.push({
				getArtifactPath() {
					return getArtifactPath(stream, basename);
				},
				produceArtifact(cb) {
					transcodeSingleStream(path, stream, basename, content, cb);
				}
			});
		}
		return cb(jobs);
	});
}

export {
	generateJobs
};
