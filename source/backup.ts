import * as libcp from 'child_process';
import * as libfs from 'fs';
import * as libpath from 'path';
import * as librl from 'readline';
import * as libcrypto from 'crypto';
import * as delete_tree from './delete_tree';
import * as imdb from './metadata';
import { compute_digest } from "./discid";
import { MediaDatabase, MediaContent, MediaType, MovieContent, EpisodeContent } from './discdb';
import { foreach } from './utils';
import { Readable, Writable } from 'stream';

let a_type: string = 'neither';
let a_show: string | null = null;
let a_season: number | null = null;
let a_episode: number | null = null;
let a_expect: number | null = null;
let a_title: string | null = null;
let a_year: number | null = null;
let a_min = 0;
let a_max = Infinity;
let a_imdb: string | null = null;

let length_to_seconds = (string: string): number => {
	let parts;
	if ((parts = /^([0-9]):([0-9][0-9]):([0-9][0-9])$/.exec(string)) != null) {
		let h = Number.parseInt(parts[1]);
		let m = Number.parseInt(parts[2]);
		let s = Number.parseInt(parts[3]);
		return (((h * 60) + m) * 60) + s;
	}
	return 0;
};

process.argv.slice(2).forEach((arg) => {
	let parts;
	if (false) {
	} else if ((parts = /^--type=(episode|movie)$/.exec(arg)) != null) {
		a_type = parts[1];
	} else if ((parts = /^--minlength=([0-9]+)$/.exec(arg)) != null) {
		a_min = Number.parseInt(parts[1]);
	} else if ((parts = /^--maxlength=([0-9]+)$/.exec(arg)) != null) {
		a_max = Number.parseInt(parts[1]);
	} else if ((parts = /^--show=(.+)$/.exec(arg)) != null) {
		a_show = parts[1];
	} else if ((parts = /^--title=(.+)$/.exec(arg)) != null) {
		a_title = parts[1];
	} else if ((parts = /^--season=([0-9]+)$/.exec(arg)) != null) {
		a_season = Number.parseInt(parts[1]);
	} else if ((parts = /^--year=([0-9]+)$/.exec(arg)) != null) {
		a_year = Number.parseInt(parts[1]);
	} else if ((parts = /^--episode=([0-9]+)$/.exec(arg)) != null) {
		a_episode = Number.parseInt(parts[1]);
	} else if ((parts = /^--expect=([0-9]+)$/.exec(arg)) != null) {
		a_expect = Number.parseInt(parts[1]);
	} else if ((parts = /^--imdb=(.+)$/.exec(arg)) != null) {
		a_imdb = parts[1];
	}
});

let db = MediaDatabase.as(JSON.parse(libfs.readFileSync("./private/db/discdb.json", "utf8")));

let save_db = (filename: string, db: Record<string, any>, cb: { (): void }) => {
	let sorted = [];
	for (let key of Object.keys(db)) {
		sorted.push({
			key: key,
			value: db[key]
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
	let out = {} as Record<string, any>;
	sorted.forEach((entry) => {
		out[entry.key] = entry.value;
	});
	let fd = libfs.openSync(filename, 'w');
	libfs.writeSync(fd, JSON.stringify(out, null, `\t`));
	libfs.closeSync(fd);
	cb();
};

type MediaMetadata = {
	content: MediaContent,
	angle: number,
	length: number
}

let analyze = (dir: string, cb: { (type: MediaType, content: Array<MediaContent>): void }) => {
	libcp.exec(`makemkvcon info disc:0 --robot --minlength=0`, (error, stdout, stderr) => {
		let detected_disc_type = "neither" as "bluray" | "dvd" | "neither";
		let detected_resolution = "neither" as "720x480" | "720x576" | "neither";
		let detected_frame_rate = "neither" as "30000/1001" | "25/1" | "neither";
		let metadata = new Array<MediaMetadata>();
		let lines = stdout.split(/\r?\n/);
		lines.map((line) => {
			let parts = line.split(':');
			let type = parts.shift() as string;
			let args = JSON.parse(`[${parts.join(':')}]`);
			if (false) {
			} else if (type === 'MSG') {
			} else if (type === 'DRV') {
			} else if (type === 'TCOUNT') {
			} else if (type === 'CINFO') {
				if (false) {
				} else if (args[0] === 1) {
					process.stdout.write(` disc_type:${args[2]}\n`);
					if (false) {
					} else if (args[2] === 'Blu-ray disc') {
						detected_disc_type = 'bluray';
					} else if (args[2] === 'DVD disc') {
						detected_disc_type = 'dvd';
					}
				} else if (args[0] === 2) {
					process.stdout.write(` title:${args[2]}\n`);
				} else if (args[0] === 28) {
					process.stdout.write(` language_code:${args[2]}\n`);
				} else if (args[0] === 29) {
					process.stdout.write(` language:${args[2]}\n`);
				} else if (args[0] === 30) {
					process.stdout.write(` title:${args[2]}\n`);
				} else if (args[0] === 31) {
					process.stdout.write(` html:${args[2]}\n`);
				} else if (args[0] === 32) {
					process.stdout.write(` media_title:${args[2]}\n`);
				} else if (args[0] === 33) {
					process.stdout.write(` unknown:${args[2]}\n`);
				} else {
					process.stdout.write(` unhandled:${line}\n`);
				}
			} else if (type === 'SINFO') {
				process.stdout.write(`title:${args[0]} stream:${args[1]}`);
				if (false) {
				} else if (args[2] === 1) {
					process.stdout.write(` stream_type:${args[4]}\n`);
				} else if (args[2] === 2) {
					process.stdout.write(` stream_name:${args[4]}\n`);
				} else if (args[2] === 3) {
					process.stdout.write(` language_code:${args[4]}\n`);
				} else if (args[2] === 4) {
					process.stdout.write(` language:${args[4]}\n`);
				} else if (args[2] === 5) {
					process.stdout.write(` codec_id:${args[4]}\n`);
				} else if (args[2] === 6) {
					process.stdout.write(` codec_short_name:${args[4]}\n`);
				} else if (args[2] === 7) {
					process.stdout.write(` codec_name:${args[4]}\n`);
				} else if (args[2] === 13) {
					process.stdout.write(` bitrate:${args[4]}\n`);
				} else if (args[2] === 14) {
					process.stdout.write(` channels:${args[4]}\n`);
				} else if (args[2] === 17) {
					process.stdout.write(` samplerate:${args[4]}\n`);
				} else if (args[2] === 19) {
					process.stdout.write(` resolution:${args[4]}\n`);
					if (args[0] === 0 && args[1] === 0) {
						if (args[4] === "720x480") {
							detected_resolution = "720x480";
						}
						if (args[4] === "720x576") {
							detected_resolution = "720x576";
						}
					}
				} else if (args[2] === 20) {
					process.stdout.write(` aspect_ratio:${args[4]}\n`);
				} else if (args[2] === 21) {
					process.stdout.write(` framerate:${args[4]}\n`);
					if (args[0] === 0 && args[1] === 0) {
						if (args[4] === "29.97 (30000/1001)") {
							detected_frame_rate = "30000/1001";
						}
						if (args[4] === "25") {
							detected_frame_rate = "25/1";
						}
					}
				} else if (args[2] === 22) {
					process.stdout.write(` unknown:${args[4]}\n`);
				} else if (args[2] === 30) {
					process.stdout.write(` stream_description:${args[4]}\n`);
				} else if (args[2] === 31) {
					process.stdout.write(` unknown:${args[4]}\n`);
				} else if (args[2] === 33) {
					process.stdout.write(` stream_delay_ms:${args[4]}\n`);
				} else if (args[2] === 38) {
					process.stdout.write(` default_flag:${args[4]}\n`);
				} else if (args[2] === 39) {
					process.stdout.write(` unknown:${args[4]}\n`);
				} else if (args[2] === 40) {
					process.stdout.write(` stereo:${args[4]}\n`);
				} else if (args[2] === 42) {
					process.stdout.write(` unknown:${args[4]}\n`);
				} else {
					process.stdout.write(` unhandled:${line}\n`);
				}
			} else if (type === 'TINFO') {
				if (!metadata[args[0]]) {
					metadata[args[0]] = {
						content: {
							type: "unknown",
							selector: ""
						},
						angle: 1,
						length: 0
					};
				}
				process.stdout.write(`title:${args[0]} attribute:${args[1]}`);
				if (false) {
				} else if (args[1] === 2) {
					process.stdout.write(` filename_base:${args[3]}\n`);
				} else if (args[1] === 8) {
					process.stdout.write(` chapters:${args[3]}\n`);
				} else if (args[1] === 9) {
					process.stdout.write(` length:${args[3]}\n`);
					metadata[args[0]].length = length_to_seconds(args[3]);
				} else if (args[1] === 10) {
					process.stdout.write(` size:${args[3]}\n`);
				} else if (args[1] === 11) {
					process.stdout.write(` bytes:${args[3]}\n`);
				} else if (args[1] === 15) {
					process.stdout.write(` angle:${args[3]}\n`);
					metadata[args[0]].angle = Number.parseInt(args[3]);
				} else if (args[1] === 16) {
					process.stdout.write(` bluray_playlist:${args[3]}\n`);
					metadata[args[0]].content.selector = args[3] + ":";
				} else if (args[1] === 24) {
					process.stdout.write(` dvdtitle:${args[3]}\n`);
					metadata[args[0]].content.selector = `${args[3]}:`;
				} else if (args[1] === 25) {
					process.stdout.write(` segment_count:${args[3]}\n`);
				} else if (args[1] === 26) {
					process.stdout.write(` cells:${args[3]}\n`);
					// Angle blocks are represented with parentheses around blocks.
					let ranges = (args[3] as string)
						.replace(/[()]/g, "")
						.split(',')
						.map((run) => run
							.split('-')
							.map(k => `@${k}`)
							.join('-'))
						.join(',');
					metadata[args[0]].content.selector += ranges;
				} else if (args[1] === 27) {
					process.stdout.write(` filename:${args[3]}\n`);
				} else if (args[1] === 28) {
					process.stdout.write(` language_code:${args[3]}\n`);
				} else if (args[1] === 29) {
					process.stdout.write(` language:${args[3]}\n`);
				} else if (args[1] === 30) {
					process.stdout.write(` string:${args[3]}\n`);
				} else if (args[1] === 31) {
					process.stdout.write(` html:${args[3]}\n`);
				} else if (args[1] === 33) {
					process.stdout.write(` unknown:${args[3]}\n`);
				} else {
					process.stdout.write(` unhandled:${line}\n`);
				}
			} else {
				process.stdout.write(`${line}\n`);
			}
		});
		let media_type = ((): MediaType => {
			if (detected_disc_type === "bluray") {
				return "bluray";
			}
			if (detected_disc_type === "dvd") {
				if (detected_frame_rate === "30000/1001" && detected_resolution === "720x480") {
					return "ntscdvd";
				}
				if (detected_frame_rate === "25/1" && detected_resolution === "720x576") {
					return "paldvd";
				}
			}
			throw "";
		})();
		if (detected_disc_type === 'bluray') {
			metadata.forEach((ct, index) => ct.content.selector = '' + index + ' ' + ct.content.selector);
		}
		let content = metadata.filter((ct) => ct.length <= a_max && ct.length >= a_min && ct.angle === 1).map((ct) => {
			return ct.content
		});
		if (a_episode != null) {
			let episode = a_episode;
			content = content.map((content) => {
				return {
					...content,
					episode: episode++
				};
			});
		}
		if (a_imdb !== null) {
			imdb.getTitle(a_imdb, (title) => {
				if (title !== null) {
					if (title.type === "show") {
						foreach(content, (orig_value, next) => {
							if (a_imdb != null) {
								let value = orig_value as EpisodeContent;
								value.type = "episode";
								value.show = title.title;
								value.imdb_show = a_imdb;
								value.genres_show = title.genres;
								value.actors_show = title.stars.map((star) => star.name);
							}
							next();
						}, () => {
							if (a_season !== null && a_imdb != null) {
								imdb.getSeason(a_imdb, a_season, (season) => {
									if (season == null) {
										return cb(media_type, content);
									}
									foreach(content, (orig_value, next) => {
										let value = orig_value as EpisodeContent;
										let episode = season.episodes.find((episode) => episode.episode_number === value.episode);
										if (episode !== undefined) {
											value.season = a_season as number;
											value.imdb = episode.id;
											value.title = episode.title;
											value.year = new Date(episode.air_date_timestamp).getUTCFullYear();
											value.summary = episode.description;
										}
										next();
									}, () => {
										cb(media_type, content);
									});
								});
							} else {
								cb(media_type, content);
							}
						});
					} else {
						foreach(content, (orig_value, next) => {
							if (title.year != null && a_imdb != null) {
								let value = orig_value as MovieContent;
								value.type = "movie";
								value.title = title.title;
								value.year = title.year;
								value.imdb = a_imdb;
								value.poster_url = title.image_url;
								value.summary = title.description;
								value.genres = title.genres;
								value.actors = title.stars.map((star) => star.name);
							}
							next();
						}, () => {
							cb(media_type, content);
						});
					}
				} else {
					cb(media_type, content);
				}
			});
		} else {
			cb(media_type, content);
		}
	});
};

let get_content = (dir: string, cb: { (hash: string, type: MediaType, content: Array<MediaContent>): void }): void => {
	compute_digest(dir, (hash) => {
		process.stdout.write(`Determined disc id as "${hash}".\n`);
		let done = (type: MediaType, content: Array<MediaContent>) => {
			cb(hash, type, content);
		};
		let media = db[hash];
		if (media !== undefined) {
			done(media.type, media.content);
		} else {
			analyze(dir, (type, content) => {
				db[hash] = {
					type,
					content
				};
				save_db("./private/db/discdb.json", db, () => {
					done(type, content);
				});
			});
		}
	});
};

function handleProgress(source: Readable, target: Writable): void {
	let rl = librl.createInterface(source);
	let progress: number | null = null;
	rl.on("line", (line) => {
		let parts = line.split(":");
		let command = parts.shift();
		let options = JSON.parse("[" + parts.join(":") + "]");
		if (false) {
		} else if (command === "PRGC") {
			if (progress != null) {
				for (let i = progress; i <= 10; i++) {
					target.write("*");
				}
			}
			target.write("\n" + options[2] + "\n");
			progress = 0;
		} else if (command === "PRGV") {
			if (progress != null) {
				let new_progress = Math.floor((options[1] / options[2]) * 10);
				for (let i = progress; i < new_progress; i++) {
					target.write("*");
				}
				progress = new_progress;
			}
		}
	});
}

let backup_dvd = (hash: string, content: Array<MediaContent>, cb: { (): void }) => {
	let jobid = libcrypto.randomBytes(16).toString("hex");
	let jobwd = "./private/jobs/" + jobid + "/";
	libfs.mkdirSync(jobwd, { recursive: true });
	let selector = content.map(ct => ct.selector).join(' ');
	let cp = libcp.spawn('makemkvcon', [
		'mkv',
		`disc:0`,
		'all',
		`--manual=${selector}`,
		'--minlength=0',
		"--robot",
		"--progress=-same",
		jobwd
	]);
	handleProgress(cp.stdout, process.stdout);
	cp.on('close', () => {
		let subpaths = libfs.readdirSync(jobwd).map((subpath) => {
			let stat = libfs.statSync(libpath.join(jobwd, subpath));
			return {
				subpath,
				stat
			};
		}).sort((one, two) => {
			return one.stat.mtimeMs - two.stat.mtimeMs;
		}).map((object) => {
			return object.subpath;
		});
		if (subpaths.length !== content.length) {
			throw new Error("Wrong number of files encountered!");
		}
		for (let i = 0; i < content.length; i++) {
			let target = `./private/archive/${hash}.${('00' + i).slice(-2)}.mkv`;
			libfs.renameSync(libpath.join(jobwd, subpaths[i]), target);
		}
		delete_tree.async(jobwd, () => {
			cb();
		});
	});
};

let backup_bluray = (hash: string, content: Array<MediaContent>, cb: { (): void }) => {
	let jobid = libcrypto.randomBytes(16).toString("hex");
	let jobwd = "./private/jobs/" + jobid + "/";
	libfs.mkdirSync(jobwd, { recursive: true });
	let index = 0;
	let done = () => {
		let subpaths = libfs.readdirSync(jobwd).map((subpath) => {
			let stat = libfs.statSync(libpath.join(jobwd, subpath));
			return {
				subpath,
				stat
			};
		}).sort((one, two) => {
			return one.stat.mtimeMs - two.stat.mtimeMs;
		}).map((object) => {
			return object.subpath;
		});
		if (subpaths.length !== content.length) {
			throw new Error("Wrong number of files encountered!");
		}
		for (let i = 0; i < content.length; i++) {
			let target = `./private/archive/${hash}.${('00' + i).slice(-2)}.mkv`;
			libfs.renameSync(libpath.join(jobwd, subpaths[i]), target);
		}
		delete_tree.async(jobwd, () => {
			cb();
		});
	};
	let next = () => {
		if (index < content.length) {
			let ct = content[index++];
			let cp = libcp.spawn('makemkvcon', [
				'mkv',
				`disc:0`,
				`${ct.selector.split(' ')[0]}`,
				'--minlength=0',
				"--robot",
				"--progress=-same",
				jobwd
			]);
			handleProgress(cp.stdout, process.stdout);
			cp.on('close', () => {
				next();
			});
		} else {
			done();
		}
	};
	next();
};

let dir = "F:\\";

get_content(dir, (hash, type, content) => {
	let content_to_rip = content;
	console.log(JSON.stringify(content_to_rip, null, "\t"));
	let callback = () => {
		process.exit(0);
	};
	if (a_expect !== null && a_expect !== content_to_rip.length) {
		process.stdout.write("Expected " + a_expect + " titles, " + content_to_rip.length + " found!\n");
	} else if (type === 'paldvd' || type === "ntscdvd") {
		backup_dvd(hash, content_to_rip, callback);
	} else if (type === 'bluray') {
		backup_bluray(hash, content_to_rip, callback);
	} else {
		process.stdout.write('bad disc type!\n');
	}
});
