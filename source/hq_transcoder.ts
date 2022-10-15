import * as libcp from "child_process";
import * as libfs from "fs";
import * as libcrypto from 'crypto';
import * as libpath from 'path';
import * as libdt from './delete_tree';
import * as stream_types from "./stream_types";
import * as ffprobe from "./ffprobe";
import * as queue_metadata from "./queue_metadata";

interface Callback<A> {
	(value: A): void
}

let gcd = (a: number, b: number): number => {
	if (!b) {
		return a;
	}
	return gcd(b, a % b);
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
			if (stream_types.VideoStream.is(stream)) {
				let divisor = gcd(stream.width, stream.height);
				let result = {
					dimx: stream.width,
					dimy: stream.height,
					parx: parseInt(stream.sample_aspect_ratio?.split(':')?.[0] ?? "1"),
					pary: parseInt(stream.sample_aspect_ratio?.split(':')?.[1] ?? "1"),
					darx: parseInt(stream.display_aspect_ratio?.split(':')?.[0] ?? `${stream.width / divisor}`),
					dary: parseInt(stream.display_aspect_ratio?.split(':')?.[1] ?? `${stream.height / divisor}`),
					farx: (stream.width / divisor),
					fary: (stream.height / divisor),
					fpsx: parseInt(stream.r_frame_rate.split('/')[0]),
					fpsy: parseInt(stream.r_frame_rate.split('/')[1]),
					color_range: stream.color_range || null,
					color_space: stream.color_space || null,
					color_transfer: stream.color_transfer || null,
					color_primaries: stream.color_primaries || null
				};
				let force_widescreen = false;
				if (force_widescreen) {
					let is_dvd_pal = result.dimx === 720 && result.dimy === 576 && result.fpsx === 25 && result.fpsy === 1;
					if (is_dvd_pal) {
						result.parx = 64;
						result.pary = 45;
						result.darx = 16;
						result.dary = 9;
					}
					let is_dvd_ntsc = result.dimx === 720 && result.dimy === 480 && result.fpsx === 30000 && result.fpsy === 1001;
					if (is_dvd_ntsc) {
						result.parx = 32;
						result.pary = 27;
						result.darx = 16;
						result.dary = 9;
					}
				}
				if (result.parx === 186 && result.pary === 157 && result.darx === 279 && result.dary === 157) {
					result.parx = 32;
					result.pary = 27;
					result.darx = 16;
					result.dary = 9;
				}
				console.log(result);
				cb(result);
				break;
			} else {
				throw `Expected a video stream!`;
			}
		}
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
	video_stream: stream_types.VideoStream
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
	let frame_size = get_frame_size(15, picture.parx * rect.w, picture.pary * rect.h);
	let frameselect = `select='between(mod(n\\,${sample_cadance})\\,0\\,${sample_keep - 1})',`;
	let cp = libcp.spawn('ffmpeg', [
		...extraopts,
		'-i', filename,
		'-vf', `format=yuv420p16le,${interlace}${frameselect}crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},scale=${frame_size.w}:${frame_size.h}`,
		'-an',
		'-v', 'quiet',
		'-f', 'rawvideo',
		'pipe:'
	]);




	let mbx = ((frame_size.w + 16 - 1) / 16) | 0;
	let mby = ((frame_size.h + 16 - 1) / 16) | 0;
	let ref = (32768 / mbx / mby) | 0;
	ref = (ref > 8) ? 8 : ref;
	// let integer_fps = Math.round(picture.fpsx / picture.fpsy);
	// "-force_key_frames", `expr:eq(mod(n,${integer_fps}),0)`
	// keyint=${integer_fps * 2}:min-keyint={integer_fps}
	let x264 = `me=umh:subme=10:ref=${ref}:me-range=24:chroma-me=1:bframes=8:crf=20:nr=0:psy=1:psy-rd=1.0,1.0:trellis=2:dct-decimate=0:qcomp=0.6:deadzone-intra=0:deadzone-inter=0:fast-pskip=1:aq-mode=1:aq-strength=1.0:colorprim=${picture.color_primaries}:transfer=${picture.color_transfer}:colormatrix=${picture.color_space}`;
	let cpx = libcp.spawn('denice', ['yuv420p16le', `${frame_size.w}`, `${frame_size.h}`, `0.02`], { cwd: '../denice/build/' });
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
		'-vf', `gradfun=1:32`,
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
	cpx.stdout.pipe(cp2.stdin);
	cp2.stdout.pipe(process.stdout);
	cp2.stderr.pipe(process.stderr);
	cp2.on('exit', () => {
		cb(outfile);
	});
};

let determine_metadata = (filename: string, cb: Callback<{ picture: FormatDetectResult, settings: queue_metadata.Setting }>): void => {
	format_detect(filename, (picture) => {
		crop_detect(filename, picture, (crop) => {
			cb({
				picture,
				settings: {
					crop,
					field_order: "progressive",
					compressibility: 1.0
				}
			});
		});
	});
};

let get_metadata = (filename: string, cb: Callback<{ picture: FormatDetectResult, settings: queue_metadata.Setting }>): void => {
	determine_metadata(filename, cb);
};

function transcodeSingleStream(input: string, output: string, stream: stream_types.VideoStream): Promise<void> {
	return new Promise((resolve, reject) => {
		get_metadata(input, (md) => {
			ffprobe.getAudioStreamsToKeep(input, (audio_streams) => {
				create_temp_dir((wd, id) => {
					let temp_path = libpath.join(wd, "video.mp4");
					encode_hardware(input, temp_path, md.picture, md.settings.crop, md.settings.field_order, md.settings.compressibility, audio_streams, () => {
						libfs.renameSync(temp_path, output);
						libdt.async(wd, resolve);
					}, 1, 1, [], [], stream);
				});
			});
		});
	});
}

function transcodevideo(path: string): Promise<void> {
	let input = `./private/hq/input/${path}`;
	let output = `./private/hq/output/${path}`;
	return new Promise((resolve, reject) => {
		ffprobe.getVideoStreamsToKeep(input, async (video_streams) => {
			for (let stream of video_streams) {
				await transcodeSingleStream(input, output, stream);
			}
			resolve();
		});
	});
}

async function transcodeaudio(path: string): Promise<void> {
	let input = `./private/hq/input/${path}`;
	let output = `./private/hq/output/${path}`;
	return new Promise((resolve, reject) => {
		let options = [
			"-i", input,
			"-vn",
			"-f", "mp4",
			"-fflags", "+bitexact",
			"-movflags", "+faststart",
			"-c:a", "aac",
			"-q:a", "2",
			"-map_metadata", "-1",
			output, "-y"
		];
		let cp = libcp.spawn("ffmpeg", options);
		cp.stderr.pipe(process.stderr);
		cp.on("error", reject);
		cp.on("close", resolve);
	});
}

async function transcodeart(path: string): Promise<void> {
	let input = `./private/hq/input/${path}`;
	let output = `./private/hq/output/${path}`;
	return new Promise((resolve, reject) => {
		const options = [
			"-i", input,
			"-vf", [
				"scale=w=720:h=1080:force_original_aspect_ratio=increase",
				"crop=720:1080",
				"setsar=1:1"
			].join(","),
			"-q:v", "1",
			"-f", "singlejpeg",
			"-fflags", "+bitexact",
			"-map_metadata", "-1",
			output, "-y"
		];
		const ffmpeg = libcp.spawn("ffmpeg", options);
		ffmpeg.on("error", reject);
		ffmpeg.on("close", resolve);
	});
}

transcodevideo("spring.webm");
