import * as libcp from "child_process";
import * as libfs from "fs";
import * as libpath from "path";
import * as cddb from "./cddb";
import * as utils from "./utils";

interface Job {
	perform(): Promise<void>;
}

function getFolders(disc: cddb.Disc): Array<string> {
	let disc_number = ("00" + disc.number).slice(-2);
	let artist = utils.pathify(disc.artists[0]);
	let title = utils.pathify(disc.title);
	let year = ("0000" + disc.year).slice(-4);
	let suffix = "cd";
	return [
		".",
		"private",
		"media",
		"audio",
		`${artist}-${title}-${year}-${suffix}`,
		`d${disc_number}`
	];
}

function getFilename(track: cddb.Track): string {
	let track_number = ("00" + track.number).slice(-2);
	let artist = utils.pathify(track.artists[0]);
	let title = utils.pathify(track.title);
	let suffix = "cd";
	return `${track_number}-${artist}-${title}-${suffix}.mp4`;
}

function createTranscodingJob(source_path: string): Job {
	let parts = libpath.basename(source_path).split(".");
	if (parts.length === 3) {
		let id = parts[0];
		let disc = db[id];
		if (disc != null) {
			let index = Number.parseInt(parts[1]);
			let track = disc.tracks[index];
			if (track != null) {
				let folders = getFolders(disc);
				let filename = getFilename(track);
				let target_path = folders.join("/") + "/" + filename;
				if (!libfs.existsSync(target_path)) {
					function perform(): Promise<void> {
						return new Promise((resolve, reject) => {
							libfs.mkdirSync(folders.join("/"), { recursive: true });
							let options = [
								"-f", "s16le",
								"-ar", "44100",
								"-ac", "2",
								"-i", source_path,
								"-f", "mp4",
								"-fflags", "+bitexact",
								"-movflags", "+faststart",
								"-c:a", "aac",
								"-q:a", "2",
								"-map_metadata", "-1",
								"-metadata", `disc=${disc.number}`,
								"-metadata", `album_artist=${disc.artists[0]}`,
								"-metadata", `album=${disc.title}`,
								"-metadata", `year=${disc.year}`,
								"-metadata", `track=${track.number}`,
								"-metadata", `artist=${track.artists[0]}`,
								"-metadata", `title=${track.title}`,
								target_path, "-y"
							];
							let cp = libcp.spawn("ffmpeg", options);
							cp.on("error", reject);
							cp.on("close", resolve);
						});
					}
					return {
						perform
					};
				}
			}
		}
	}
	throw "Unable to create job!";
}

const db = utils.loadDatabase("./private/db/cddb.json", cddb.Database.as);

async function createJobList(path: string): Promise<Array<Job>> {
	let jobs = new Array<Job>();
	try {
		jobs.push(createTranscodingJob(path));
	} catch (error) {}
	return jobs;
}

export {
	createJobList
};
