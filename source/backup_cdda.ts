import * as libcp from 'child_process';
import * as libcrypto from 'crypto';
import * as libfs from 'fs';
import * as libhttps from 'https';
import * as librl from 'readline';
import * as cddb from "./cddb";
import * as disc_reader from "./disc_reader";
import * as metadata from "./metadata";
import * as musicbrainz from "./musicbrainz";
import * as utils from "./utils";
import * as tidal from "./tidal";

let db = utils.loadDatabase("./private/db/cddb.json", cddb.Database.as);

const SEARCH_TIDAL = false;

interface Callback<T> {
	(value: T): void;
}

type CDDA_TRACK = {
	track_number: number;
	track_index: number;
	offset: number;
	length: number;
	duration_ms: number;
	is_audio: boolean;
};

type CDDA_TOC = {
	buffer: Buffer;
	disc_id: string;
	length: number;
	first_track: number;
	last_track: number;
	tracks: Array<CDDA_TRACK>;
};

function log(string: string): void {
	process.stdout.write(`${string}\n`);
	return;
}

function save_disc_to_db(disc_id: string, disc: cddb.Disc, cb: Callback<void>): void {
	db[disc_id] = disc;
	libfs.writeFile(`./private/db/cddb.json`, JSON.stringify(db, null, `\t`), (error) => {
		cb();
	});
}

function get_disc_from_db(disc_id: string): cddb.Disc | null {
	let disc = db[disc_id];
	if (disc != null) {
		return disc;
	}
	return null;
}

function get_raw_toc(cb: Callback<Buffer>): void {
	let chunks = new Array<Buffer>();
	let cp = libcp.spawn(`main`, [ `toc` ], { cwd: "../disc_reader/build/targets/" });
	cp.stderr.pipe(process.stderr);
	cp.stdout.setEncoding(`binary`);
	cp.stdout.on(`data`, (chunk) => {
		chunks.push(Buffer.from(chunk, `binary`));
	});
	cp.on(`close`, (code) => {
		let toc = Buffer.concat(chunks);
		cb(toc);
	});
	return;
}

function sector_from_msf(m: number, s: number, f: number): number {
	return (((m * 60) + s) * 75) + f - 150;
}

function parse_toc(buffer: Buffer): CDDA_TOC {
	let disc_id = get_disc_id(buffer);
	let offset = 0;
	let length = buffer.readUInt16BE(offset); offset += 2;
	let first_track = buffer.readUInt8(offset); offset += 1;
	let last_track = buffer.readUInt8(offset); offset += 1;
	let tracks = new Array<CDDA_TRACK>();
	let found_audio = false;
	for (let track_number = first_track; track_number <= last_track; track_number++) {
		let track_index = track_number - 1;
		let adr_control_current_track = buffer.readUInt8(offset + (track_index * 8) + 1);
		let adr_current_track = (adr_control_current_track >> 4) & 0x0F;
		let control_current_track = (adr_control_current_track >> 0) & 0x0F;
		let current_track_is_data = (control_current_track & 0b0100) !== 0;
		let adr_control_next_track = buffer.readUInt8(offset + ((track_index + 1) * 8) + 1);
		let adr_next_track = (adr_control_next_track >> 4) & 0x0F;
		let control_next_track = (adr_control_next_track >> 0) & 0x0F;
		let next_track_is_data = (control_next_track & 0b0100) !== 0;
		if (found_audio && current_track_is_data) {
			break;
		}
		found_audio = found_audio || !current_track_is_data;
		let m1 = buffer.readUInt8(offset + (track_index * 8) + 5);
		let s1 = buffer.readUInt8(offset + (track_index * 8) + 6);
		let f1 = buffer.readUInt8(offset + (track_index * 8) + 7);
		let m2 = buffer.readUInt8(offset + ((track_index + 1) * 8) + 5);
		let s2 = buffer.readUInt8(offset + ((track_index + 1) * 8) + 6);
		let f2 = buffer.readUInt8(offset + ((track_index + 1) * 8) + 7);
		let sectors1 = sector_from_msf(m1, s1, f1);
		let sectors2 = sector_from_msf(m2, s2, f2);
		// Subtract 152 seconds (11400 frames) from next track MSF to compute correct track length in sectors for mixed mode cds.
		if (found_audio && next_track_is_data) {
			sectors2 -= 11400;
		}
		let duration_ms = Math.floor((sectors2 - sectors1) * (1000 / 75));
		tracks.push({
			track_number,
			track_index,
			offset: sectors1,
			length: sectors2 - sectors1,
			duration_ms,
			is_audio: !current_track_is_data
		});
	}
	return {
		buffer,
		disc_id,
		length,
		first_track,
		last_track,
		tracks
	};
}

function get_toc(cb: Callback<CDDA_TOC>): void {
	return get_raw_toc((buffer) => {
		let toc = parse_toc(buffer);
		return cb(toc);
	});
}

function get_disc_id(toc: Buffer): string {
	let hash = libcrypto.createHash(`sha256`);
	hash.update(toc);
	let disc_id = hash.digest(`hex`);
	return disc_id;
}

function get_disc_from_ws(options: Arguments, toc: CDDA_TOC, cb: Callback<cddb.Disc | null>): void {
	let mb_disc_id = get_mb_disc_id(toc);
	console.log(toc);
	log(`Disc id (Musicbrainz): ${mb_disc_id}`);
	get_mb_data(options, mb_disc_id, (data) => {
		if (data == null) {
			return cb(null);
		}
		let disc = get_disc_metadata_from_mb(options, mb_disc_id, data);
		if (disc == null) {
			return cb(null);
		}
		if (disc.tracks.length !== toc.tracks.length) {
			console.log(`Expected metadata for ${toc.tracks.length} tracks but found ${disc.tracks.length}!`);
			return cb(null);
		}
		cb(disc);
	});
}

function generateEmptyMetaData(toc: CDDA_TOC): cddb.Disc {
	return {
		artists: [],
		title: "",
		number: 1,
		year: 0,
		tracks: toc.tracks.map((track) => ({
			number: track.track_number,
			title: "",
			artists: []
		}))
	};
};

function get_disc(options: Arguments, cb: Callback<{ id: string, toc: CDDA_TOC, disc: cddb.Disc } | null>): void {
	return get_toc((toc) => {
		let id = toc.disc_id;
		log(`Disc id determined as "${id}"`);
		let disc = get_disc_from_db(id);
		if (disc !== null) {
			log(`Disc recognized.`);
			return cb({id, toc, disc});
		} else {
			log(`Disc not recognized.`);
			return get_disc_from_ws(options, toc, (disc) => {
				if (disc != null) {
					(async () => {
						const query = [
							disc.title,
							...disc.artists,
						].join(" ");
						if (SEARCH_TIDAL) {
							console.log("Searching tidal...");
							try {
								const results = await tidal.search(query, ["ALBUMS"]);
								const album = results.albums[0];
								if (album != null) {
									disc.cover_art_url = album.cover;
									disc.tidal = album.id;
								}
							} catch (error) {}
						}
						return save_disc_to_db(id, disc, () => {
							return cb({id, toc, disc});
						});
					})();
				} else {
					if (options.placeholder) {
						let disc = generateEmptyMetaData(toc);
						return cb({ id, toc, disc });
					} else {
						return cb(null);
					}
				}
			});
		}
	});
}

function backup_all_audio_tracks(read_offset_correction: number, cb: Callback<Buffer>): void {
	console.log({read_offset_correction: read_offset_correction});
	let chunks = new Array<Buffer>();
	let cp = libcp.spawn(`main`, [ `ext`, `all` ], { cwd: "../disc_reader/build/targets/" });
	cp.stderr.pipe(process.stderr);
	cp.stdout.setEncoding(`binary`);
	cp.stdout.on(`data`, (chunk) => {
		chunks.push(Buffer.from(chunk, `binary`));
	});
	cp.on(`close`, (code) => {
		let data = Buffer.concat(chunks);
		let byte_offset = read_offset_correction * 4;
		let padding = Buffer.alloc(Math.abs(byte_offset));
		if (byte_offset > 0) {
			data = Buffer.concat([data.slice(byte_offset), padding]);
		} else if (byte_offset < 0) {
			data = Buffer.concat([padding, data.slice(0, byte_offset)]);
		}
		cb(data);
	});
	return;
}

async function getDeviceDetails(): Promise<disc_reader.DeviceDetails> {
	return new Promise<string>((resolve, reject) => {
		libcp.exec([
			"main",
			"drive"
		].join(" "), { cwd: "../disc_reader/build/targets/" }, (error, stdout, stderr) => {
			if (error != null) {
				return reject(error);
			}
			return resolve(stderr);
		});
	}).then((stderr) => {
		return disc_reader.DeviceDetails.as(JSON.parse(stderr));
	});
}

async function getDriveReadOffsetCorrection(): Promise<number> {
	let device_details = await getDeviceDetails();
	console.log(device_details);
	let xml = await metadata.promiseXML("http://www.accuraterip.com/driveoffsets.htm");
	let rows = xml.querySelectorAll("tr");
	let key = device_details.vendor_id + " - " + device_details.product_id;
	for (let row of rows) {
		let children = Array.from(row.querySelectorAll("td"));
		let font = children[0].querySelector("font");
		if (font != null) {
			if (font.getText() === key) {
				let font = children[1].querySelector("font");
				if (font != null) {
					let read_offset_correction = Number.parseInt(font.getText());
					return read_offset_correction;
				}
				break;
			}
		}
	}
	throw "Unable to fetch drive read offset!";
}

function backup_disc(options: Arguments, val: { id: string, toc: CDDA_TOC, disc: cddb.Disc }, cb: Callback<void>): void {
	let folders = [
		".",
		"private",
		"archive",
		"audio",
		val.id
	];
	libfs.mkdirSync(folders.join("/"), { recursive: true });
	libfs.writeFileSync(folders.join("/") + `/toc.bin`, val.toc.buffer);
	let sectorcache = new Array<Array<{
		sector: Buffer,
		hash: string,
		count: number
	}>>();
	function computeStats(): void {
		let replaygain_gain: number | null = null;
		let replaygain_peak: number | null = null;
		let mean_volume: number | null = null;
		let peak_volume: number | null = null;
		let ffmpeg = libcp.spawn("ffmpeg", [
			"-f", "s16le",
			"-ar", "44100",
			"-ac", "2",
			"-i", "pipe:",
			"-filter:a", "volumedetect,replaygain",
			"-f", "null",
			"/dev/null"
		]);
		ffmpeg.on("exit", () => {
			if (replaygain_gain != null && replaygain_peak != null && mean_volume != null && peak_volume != null) {
				val.disc.volume = {
					replaygain_gain,
					replaygain_peak,
					mean_volume,
					peak_volume
				};
			}
			save_disc_to_db(val.id, val.disc, () => {
				saveData();
			});
		});
		librl.createInterface(ffmpeg.stderr).on("line", (line) => {
			let parts: RegExpExecArray | null = null;
			if (false) {
			} else if ((parts = /track[_]gain[\s]+[=][\s]+([+-]?[0-9]+(?:[.][0-9]+)?)[\s]+dB/.exec(line)) != null) {
				replaygain_gain = Number.parseFloat(parts[1]);
			} else if ((parts = /track[_]peak[\s]+[=][\s]+([+-]?[0-9]+(?:[.][0-9]+)?)/.exec(line)) != null) {
				replaygain_peak = Number.parseFloat(parts[1]);
			} else if ((parts = /mean[_]volume[:][\s]+([+-]?[0-9]+(?:[.][0-9]+)?)[\s]+dB/.exec(line)) != null) {
				mean_volume = Number.parseFloat(parts[1]);
			} else if ((parts = /max[_]volume[:][\s]+([+-]?[0-9]+(?:[.][0-9]+)?)[\s]+dB/.exec(line)) != null) {
				peak_volume = Number.parseFloat(parts[1]);
			}
		});
		utils.foreach(sectorcache, (sector, next) => {
			ffmpeg.stdin.write(sector[0].sector, next);
		}, () => {
			ffmpeg.stdin.end();
		});
	}
	function saveData(): void {
		let start_offset = 0;
		if (val.toc.tracks.length > 0) {
			start_offset = val.toc.tracks[0].offset;
		}
		let skipped_data_sectors_count = 0;
		utils.foreach(val.toc.tracks, (track, next_track) => {
			if (!track.is_audio) {
				skipped_data_sectors_count += track.length;
				next_track();
				return;
			}
			let target_path = folders.join("/") + `/${val.id}.${('00' + track.track_index).slice(-2)}.wav`;
			let ffmpeg = libcp.spawn("ffmpeg", [
				"-f", "s16le",
				"-ar", "44100",
				"-ac", "2",
				"-i", "pipe:",
				target_path, "-y"
			]);
			ffmpeg.on("exit", () => {
				next_track();
			});
			let offset = track.offset - start_offset - skipped_data_sectors_count;
			utils.foreach(sectorcache.slice(offset, offset + track.length), (sector, next) => {
				ffmpeg.stdin.write(sector[0].sector, next);
			}, () => {
				ffmpeg.stdin.end();
			});
		}, () => {
			cb();
		});
	}
	let reads = 0;
	let max_reads = 8;
	function getData(read_offset_correction: number): void {
		backup_all_audio_tracks(read_offset_correction, (data) => {
			reads += 1;
			let sectors = Math.floor(data.length / 2352);
			console.log(`Reads: ${reads}/${max_reads}, Got Sectors: ${sectors}`);
			for (let i = sectorcache.length; i < sectors; i++) {
				sectorcache.push(new Array<{
					sector: Buffer,
					hash: string,
					count: number
				}>());
			};
			let counts = new Array<number>(max_reads).fill(0);
			for (let i = 0; i < sectors; i++) {
				let sector = data.slice((i + 0) * 2352, (i + 1) * 2352);
				let hash = libcrypto.createHash("sha256").update(sector).digest("hex");
				let found = sectorcache[i].find((entry) => entry.hash === hash);
				if (found != null) {
					found.count += 1;
				} else {
					let count = 1;
					sectorcache[i].push({
						sector,
						hash,
						count
					});
				}
				sectorcache[i] = sectorcache[i].sort((one, two) => {
					return two.count - one.count;
				});
				counts[sectorcache[i][0].count-1] += 1;
			}
			console.log(JSON.stringify(counts, null, "\t"));
			let accepted = counts.slice(4 - 1).reduce((sum, count) => {
				return sum + count;
			}, 0);
			let total_sectors = val.toc.tracks.reduce((sum, track) => {
				return sum + track.length;
			}, 0);
			let leading_zeroes = counts.reduce((sum, count, index) => {
				if (sum === index) {
					if (count === 0) {
						return sum + 1;
					}
				}
				return sum;
			}, 0);
			let identical_copies = leading_zeroes + 1;
			console.log(identical_copies);
			if ((reads === 2) && (identical_copies === 2)) {
				computeStats();
			} else if ((accepted < total_sectors) && (reads < max_reads)) {
				console.log(`Accepted: ${accepted}/${total_sectors}`);
				getData(read_offset_correction);
			} else {
				computeStats();
			}
		});
	}
	if (options.read_offset_correction != null) {
		getData(options.read_offset_correction);
	} else {
		getDriveReadOffsetCorrection().then((read_offset_correction) => {
			getData(read_offset_correction);
		});
	}
}

function get_mb_disc_id(toc: CDDA_TOC): string {
	let n = toc.tracks.length - 1;
	let buffer = Buffer.alloc(6 + (4 * 99));
	let offset = 0;
	buffer.writeUInt8(toc.tracks[0].track_number, offset); offset += 1;
	buffer.writeUInt8(toc.tracks[n].track_number, offset); offset += 1;
	buffer.writeUInt32BE(150 + toc.tracks[n].offset + toc.tracks[n].length, offset); offset += 4;
	for (let i = 0; i < toc.tracks.length; i++) {
		buffer.writeUInt32BE(150 + toc.tracks[i].offset, offset); offset += 4;
	}
	for (let i = toc.tracks.length; i < 99; i++) {
		buffer.writeUInt32BE(0, offset); offset += 4;
	}
	let hex = buffer.toString(`hex`).toUpperCase();
	let hash = libcrypto.createHash(`sha1`);
	hash.update(hex);
	let digest = hash.digest(`base64`).split(`+`).join(`.`).split(`/`).join(`_`).split(`=`).join(`-`);
	return digest;
}

type RequriedArguments = {

};

type OptionalArguments = {
	release_id: string,
	disc_number: number,
	read_offset_correction: number,
	placeholder: boolean
};

type Arguments = Partial<OptionalArguments> & RequriedArguments;

async function parseCommandLine(): Promise<Arguments> {
	let disc_number: number | undefined;
	let release_id: string | undefined;
	let read_offset_correction: number | undefined;
	let placeholder: boolean | undefined;
	let found_unrecognized_argument = false;
	for (let arg of process.argv.slice(2)) {
		let parts;
		if (false) {
		} else if ((parts = /^--disc=([0-9]+)$/.exec(arg)) != null) {
			disc_number = Number.parseInt(parts[1]);
		} else if ((parts = /^--release=(.+)$/.exec(arg)) != null) {
			release_id = parts[1];
		} else if ((parts = /^--read-offset-correction=([+-]?[0-9]+)$/.exec(arg)) != null) {
			read_offset_correction = Number.parseInt(parts[1]);
		}else if ((parts = /^--placeholder=(true|false)$/.exec(arg)) != null) {
			placeholder = parts[1] === "true";
		}  else {
			found_unrecognized_argument = true;
			process.stderr.write("Unrecognized argument \"" + arg + "\"!\n");
		}
	}
	if (found_unrecognized_argument) {
		process.stderr.write("Arguments:\n");
		process.stderr.write("	--disc=number\n");
		process.stderr.write("	--release=string\n");
		process.stderr.write("	--read-offset-correction=number\n");
		process.stderr.write("	--placeholder=boolean\n");
		process.exit(0);
	}
	return {
		release_id,
		disc_number,
		read_offset_correction,
		placeholder
	};
}

function get_mb_data(options: Arguments, mb_disc_id: string, cb: Callback<musicbrainz.DiscIdLookupResponse | null>): void {
	let url = `https://musicbrainz.org/ws/2/discid/${mb_disc_id}?fmt=json&inc=artist-credits+recordings`;
	if (options.release_id != null) {
		url = `https://musicbrainz.org/ws/2/release/${options.release_id}?fmt=json&inc=artist-credits+discids+recordings`;
	}
	libhttps.request(url, {
		method: `GET`,
		headers: {
			'User-Agent': `Disco/0.0.1 (  )`
		}
	}, (response) => {
		response.setEncoding('binary');
		let chunks = new Array<Buffer>();
		response.on('data', (chunk) => {
			chunks.push(Buffer.from(chunk, 'binary'));
		});
		response.on('end', () => {
			let buffer = Buffer.concat(chunks);
			let string = buffer.toString('utf8');
			try {
				let json = JSON.parse(string);
				if (options.release_id != null) {
					json = {
						releases: [json]
					};
				}
				cb(musicbrainz.DiscIdLookupResponse.as(json));
			} catch (error) {
				cb(null);
			}
		});
	}).end();
}

function get_disc_metadata_from_mb(options: Arguments, mb_disc_id: string, mb: musicbrainz.DiscIdLookupResponse): cddb.Disc | null {
	let parts: RegExpExecArray | null;
	if (mb.releases.length === 0) {
		return null;
	}
	let release = mb.releases[0];
	if (release.media.length === 0) {
		return null;
	}
	let media = release.media.find((media) => {
		return media.discs != null && null != media.discs.find((disc) => {
			return disc.id === mb_disc_id;
		});
	});
	if (media == null) {
		media = release.media[options.disc_number != null ? options.disc_number : 0];
	}
	let id = release.id;
	let artists = release[`artist-credit`].map((ac) => ac.name.normalize("NFC"));
	let title = release.title.normalize("NFC");
	let number = media.position;
	let year = 0;
	if ((parts = /^([0-9]{4})/.exec(release.date ?? "")) !== null) {
		year = Number.parseInt(parts[1]);
	}
	let tracks = media.tracks.map((track, index) => {
		let title = track.title.normalize("NFC");
		let artists = track[`artist-credit`].map((ac) => ac.name.normalize("NFC"));
		let number = index + 1;
		return {
			number,
			title,
			artists
		};
	});
	let volume = undefined;
	return {
		musicbrainz: id,
		volume,
		artists,
		title,
		number,
		year,
		tracks
	};
}

parseCommandLine().then((options) => {
	get_disc(options, (val) => {
		if (val != null) {
			console.log(JSON.stringify(val.disc, null, "\t"));
			console.log(val.toc)
			backup_disc(options, val, () => {
				process.exit(0);
			});
		}
	});
});
