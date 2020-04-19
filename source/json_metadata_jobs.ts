import * as libfs from "fs";
import * as discdb from "./discdb";
import * as job from "./job";
import * as utils from "./utils";

async function getMetadata(database: discdb.MediaDatabase, basename: string): Promise<{
	id: string,
	index: number,
	media: discdb.Media,
	track: discdb.MediaContent
}> {
	const parts = basename.split(".");
	if (parts.length === 3) {
		const id = parts[0];
		const media = database[id];
		if (media != null) {
			const index = Number.parseInt(parts[1]);
			const track = media.content[index];
			if (track != null) {
				return {
					id,
					index,
					media,
					track
				};
			}
		}
	}
	throw "Unable to get metadata!";
}

async function getTargetPaths(media: discdb.Media, track: discdb.MediaContent): Promise<Array<string>> {
	if (discdb.EpisodeContent.is(track)) {
		let show = utils.pathify(track.show);
		let season_number = ("00" + track.season).slice(-2);
		let episode_number = ("00" + track.episode).slice(-2);
		let title = utils.pathify(track.title);
		let suffix = utils.pathify(media.type);
		return [
			".",
			"private",
			"media",
			"video",
			"shows",
			`${show}`,
			`s${season_number}`,
			`${show}-s${season_number}e${episode_number}-${title}-${suffix}`,
			`00-metadata`
		];
	}
	if (discdb.MovieContent.is(track)) {
		let title = utils.pathify(track.title);
		let year = ("0000" + track.year).slice(-4);
		let suffix = utils.pathify(media.type);
		let dir = title.substr(0, 1);
		return [
			".",
			"private",
			"media",
			"video",
			"movies",
			`${dir}`,
			`${title}-${year}-${suffix}`,
			`00-metadata`,
		];
	}
	throw "Unable to get path!";
}

type EpisodeMetadata = {
	type: "episode",
	imdb: string,
	title: string,
	year: number,
	summary: string,
	show: {
		imdb: string,
		title: string,
		genres: string[]
	},
	season: number,
	episode: number
};

type MovieMetadata = {
	type: "movie",
	imdb: string,
	title: string,
	year: number,
	summary: string,
	genres: string[]
};

async function getJson(media: discdb.Media, track: discdb.MediaContent): Promise<EpisodeMetadata | MovieMetadata> {
	if (discdb.EpisodeContent.is(track)) {
		const json: EpisodeMetadata = {
			type: "episode",
			imdb: track.imdb,
			title: track.title,
			year: track.year,
			summary: track.summary,
			show: {
				imdb: track.imdb_show,
				title: track.show,
				genres: track.genres_show
			},
			season: track.season,
			episode: track.episode
		};
		return json;
	}
	if (discdb.MovieContent.is(track)) {
		const json: MovieMetadata = {
			type: "movie",
			imdb: track.imdb,
			title: track.title,
			year: track.year,
			summary: track.summary,
			genres: track.genres
		};
		return json;
	}
	throw "Unable to get json!";
}

async function createJobListRecursively(database: discdb.MediaDatabase, directories: Array<string>): Promise<Array<job.PromiseJob>> {
	const jobs = new Array<job.PromiseJob>();
	const entries = await libfs.promises.readdir(directories.join("/"), {
		withFileTypes: true
	});
	for (const entry of entries) {
		const basename = entry.name;
		if (entry.isDirectory()) {
			jobs.push(...await createJobListRecursively(database, [
				...directories,
				basename
			]));
			continue;
		}
		if (entry.isFile() && basename.endsWith(".mkv")) {
			async function perform(): Promise<void> {
				const metadata = await getMetadata(database, basename);
				const media = metadata.media;
				const track = metadata.track;
				const paths = await getTargetPaths(media, track);
				const path = paths.join("/") + ".json";
				if (!libfs.existsSync(path)) {
					console.log(path);
					libfs.mkdirSync(paths.slice(0, -1).join("/"), { recursive: true });
					const json = await getJson(media, track);
					libfs.writeFileSync(path, JSON.stringify(json, null, "\t"));
				}
			}
			jobs.push({
				perform
			});
			continue;
		}
	}
	return jobs;
}

async function createJobList(): Promise<Array<job.PromiseJob>> {
	const database = utils.loadDatabase("./private/db/discdb.json", discdb.MediaDatabase.as);
	return createJobListRecursively(database, [
		".",
		"private",
		"archive",
		"video"
	]);
}

export {
	createJobList
};
