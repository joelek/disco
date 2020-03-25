import * as libfs from "fs";
import * as libpath from "path";
import * as discdb from "./discdb";
import * as ffmpeg from "./ffmpeg";
import * as ffprobe from "./ffprobe";
import * as job from "./job";
import * as stream_types from "./stream_types";
import * as utils from "./utils";

type Metadata = {
	disc: discdb.Media,
	track: discdb.MediaContent
};

const db = utils.loadDatabase("./private/db/discdb.json", discdb.MediaDatabase.as);

function getPaths(disc: discdb.Media, track: discdb.MediaContent): Array<string> {
	let root = [
		".",
		"private",
		"media",
		"video"
	];
	if (discdb.EpisodeContent.is(track)) {
		let show = utils.pathify(track.show);
		let season_number = ("00" + track.season).slice(-2);
		let episode_number = ("00" + track.episode).slice(-2);
		let title = utils.pathify(track.title);
		let suffix = utils.pathify(disc.type);
		return [
			...root,
			"shows",
			`${show}`,
			`s${season_number}`,
			`${show}-s${season_number}e${episode_number}-${title}-${suffix}`,
			`${show}-s${season_number}e${episode_number}-${title}-${suffix}`
		];
	}
	if (discdb.MovieContent.is(track)) {
		let title = utils.pathify(track.title);
		let year = ("0000" + track.year).slice(-4);
		let suffix = utils.pathify(disc.type);
		let dir = title.substr(0, 1);
		let part = ("00" + track.part).slice(-2);
		return [
			...root,
			"movies",
			`${dir}`,
			`${title}-${year}-${suffix}`,
			`${part}-${title}-${year}-${suffix}`,
		];
	}
	throw "Unable to get path!";
}

async function createVideoJob(source_path: string, metadata: Metadata): Promise<job.PromiseJob> {
	let disc = metadata.disc;
	let track = metadata.track;
	let paths = getPaths(disc, track);
	let target_path = paths.join("/") + ".mp4";
	if (libfs.existsSync(target_path)) {
		throw "Unable to create job!";
	}
	async function perform(): Promise<void> {
		libfs.mkdirSync(paths.slice(0, -1).join("/"), { recursive: true });
		let stream = await ffprobe.getVideoStream(source_path);
	}
	return {
		perform
	};
}

async function getMetadata(source_path: string): Promise<Metadata> {
	let parts = libpath.basename(source_path).split(".");
	if (parts.length === 3) {
		let id = parts[0];
		let disc = db[id];
		if (disc != null) {
			let index = Number.parseInt(parts[1]);
			let track = disc.content[index];
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
		jobs.push(await createVideoJob(source_path, metadata));
	} catch (error) {}
	return jobs;
}

export {
	createJobList
};
