import * as libcp from "child_process";
import * as libfs from "fs";
import * as libpath from "path";
import * as cddb from "./cddb";
import * as job from "./job";
import * as utils from "./utils";

type Metadata = {
	disc: cddb.Disc,
	track: cddb.Track
};

function makePath(components_ordered: Array<{ value: string, flex: number }>): string {
	let components = components_ordered.slice().sort((one, two) => {
		return two.flex - one.flex;
	});
	while (true) {
		let candidate = components_ordered.map((component) => {
			return component.value;
		}).join("-");
		if (candidate.length <= 128) {
			return candidate;
		}
		let component = components.find((component) => {
			return component.flex >= 0 && component.value.length > 0;
		});
		if (component == null) {
			throw "Unable to make path!";
		}
		component.value = component.value.split("_").slice(0, -1).join("_");
	}
}

function getPaths(disc: cddb.Disc, track: cddb.Track): Array<string> {
	let root = [
		".",
		"private",
		"media",
		"audio"
	];
	let disc_number = ("00" + disc.number).slice(-2);
	let disc_artist = utils.pathify(disc.artists.join("; "));
	let disc_title = utils.pathify(disc.title);
	let disc_year = ("0000" + disc.year).slice(-4);
	let suffix = "cd";
	let track_number = ("00" + track.number).slice(-2);
	let track_artist = utils.pathify(track.artists.join("; "));
	let track_title = utils.pathify(track.title);
	return [
		...root,
		`${disc_artist}`,
		`${disc_artist}-${disc_year}-${disc_title}-${disc_number}-${suffix}`,
		makePath([
			{
				value: track_number,
				flex: 0
			},
			{
				value: track_artist,
				flex: 1
			},
			{
				value: track_title,
				flex: 2,
			},
			{
				value: suffix,
				flex: 0
			}
		])
	];
}

function getVolumeAdjustmentDecibels(volume?: cddb.Volume): number {
	let result = 0;
	if (volume != null) {
		let target_level_db = -18;
		let adjustment_db = target_level_db - volume.mean_volume;
		let max_adjustment_db = 0.0 - volume.peak_volume;
		let clipped_adjustment_db = Math.min(max_adjustment_db, adjustment_db);
		result = clipped_adjustment_db;
	}
	return result;
}

async function createAudioJob(source_path: string, metadata: Metadata): Promise<job.PromiseJob> {
	let disc = metadata.disc;
	let track = metadata.track;
	let paths = getPaths(disc, track);
	let target_path = paths.join("/") + ".mp4";
	if (libfs.existsSync(target_path)) {
		throw "Unable to create job!";
	}
	async function perform(): Promise<void> {
		libfs.mkdirSync(paths.slice(0, -1).join("/"), { recursive: true });
		return new Promise((resolve, reject) => {
			let comment = JSON.stringify({
				musicbrainz: disc.musicbrainz
			});
			let options = [
				"-i", source_path,
				"-af", `volume=${getVolumeAdjustmentDecibels(metadata.disc.volume)}dB`,
				"-f", "mp4",
				"-fflags", "+bitexact",
				"-movflags", "+faststart",
				"-c:a", "aac",
				"-q:a", "2",
				"-map_metadata", "-1",
				"-metadata", `disc=${disc.number}`,
				"-metadata", `album_artist=${disc.artists.join("; ")}`,
				"-metadata", `album=${disc.title}`,
				"-metadata", `date=${disc.year}`,
				"-metadata", `track=${track.number}`,
				"-metadata", `artist=${track.artists.join("; ")}`,
				"-metadata", `title=${track.title}`,
				"-metadata", `comment=${comment}`,
				target_path, "-y"
			];
			console.log(`${source_path} --> ${target_path}`);
			let cp = libcp.spawn("ffmpeg", options);
			cp.on("error", reject);
			cp.on("close", resolve);
		});
	}
	return {
		perform
	};
}

async function getMetadata(source_path: string): Promise<Metadata> {
	const db = utils.loadDatabase("./private/db/cddb.json", cddb.Database.as);
	let parts = libpath.basename(source_path).split(".");
	if (parts.length === 3) {
		let id = parts[0];
		let disc = db[id];
		if (disc != null) {
			let index = Number.parseInt(parts[1]);
			let track = disc.tracks[index];
			if (track != null) {
				return {
					disc,
					track
				};
			}
		}
	}
	throw "Unable to get metadata!";
}

async function createJobList(source_path: string): Promise<Array<job.PromiseJob>> {
	let jobs = new Array<job.PromiseJob>();
	let metadata = await getMetadata(source_path);
	try {
		jobs.push(await createAudioJob(source_path, metadata));
	} catch (error) {}
	return jobs;
}

export {
	createJobList
};
