import * as libfs from "fs";
import * as discdb from "./discdb";
import * as job from "./job";
import * as utils from "./utils";

function getMetadata(database: discdb.MediaDatabase, basename: string): {
	id: string,
	index: number,
	media: discdb.Media,
	track: discdb.MediaContent
} {
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

function getShowTargetPath(media: discdb.Media, track: discdb.EpisodeContent): Array<string> {
	let show = utils.pathify(track.show);
	return [
		".",
		"private",
		"media",
		"video",
		"shows",
		`${show}`,
		`00-metadata`
	];
}

function getEpisodeTargetPath(media: discdb.Media, track: discdb.EpisodeContent): Array<string> {
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

function getMovieTargetPath(media: discdb.Media, track: discdb.MovieContent): Array<string> {
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

type ShowMetadata = {
	type: "show",
	imdb?: string,
	title: string,
	summary?: string,
	genres: string[],
	actors: string[]
};

type EpisodeMetadata = {
	type: "episode",
	imdb?: string,
	title: string,
	year?: number,
	summary?: string,
	show: {
		imdb?: string,
		title: string,
		summary?: string,
		genres: string[],
		actors: string[]
	},
	season: number | {
		number: number,
		title?: string
	},
	episode: number,
	copyright?: string
};

type MovieMetadata = {
	type: "movie",
	imdb?: string,
	title: string,
	year?: number,
	summary?: string,
	genres: string[],
	actors: string[],
	copyright?: string
};

function getShowJson(media: discdb.Media, track: discdb.EpisodeContent): ShowMetadata {
	return {
		type: "show",
		imdb: track.imdb_show,
		title: track.show,
		summary: track.summary_show,
		genres: track.genres_show,
		actors: track.actors_show
	};
}

function getEpisodeJson(media: discdb.Media, track: discdb.EpisodeContent): EpisodeMetadata {
	return {
		type: "episode",
		imdb: track.imdb,
		title: track.title,
		year: track.year,
		summary: track.summary,
		show: {
			imdb: track.imdb_show,
			title: track.show,
			summary: track.summary_show,
			genres: track.genres_show,
			actors: track.actors_show
		},
		season: track.season,
		episode: track.episode
	};
}

function getMovieJson(media: discdb.Media, track: discdb.MovieContent): MovieMetadata {
	return {
		type: "movie",
		imdb: track.imdb,
		title: track.title,
		year: track.year,
		summary: track.summary,
		genres: track.genres,
		actors: track.actors
	};
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
			const metadata = getMetadata(database, basename);
			const media = metadata.media;
			const track = metadata.track;
			if (discdb.EpisodeContent.is(track)) {
				jobs.push({
					perform: async () => {
						const paths = getShowTargetPath(media, track);
						const path = paths.join("/") + ".json";
						if (!libfs.existsSync(path)) {
							console.log(path);
							libfs.mkdirSync(paths.slice(0, -1).join("/"), { recursive: true });
							const json = getShowJson(media, track);
							libfs.writeFileSync(path, JSON.stringify(json, null, "\t") + "\n");
						}
					}
				});
				jobs.push({
					perform: async () => {
						const paths = getEpisodeTargetPath(media, track);
						const path = paths.join("/") + ".json";
						if (!libfs.existsSync(path)) {
							console.log(path);
							libfs.mkdirSync(paths.slice(0, -1).join("/"), { recursive: true });
							const json = getEpisodeJson(media, track);
							libfs.writeFileSync(path, JSON.stringify(json, null, "\t") + "\n");
						}
					}
				});
			} else if (discdb.MovieContent.is(track)) {
				jobs.push({
					perform: async () => {
						const paths = getMovieTargetPath(media, track);
						const path = paths.join("/") + ".json";
						if (!libfs.existsSync(path)) {
							console.log(path);
							libfs.mkdirSync(paths.slice(0, -1).join("/"), { recursive: true });
							const json = getMovieJson(media, track);
							libfs.writeFileSync(path, JSON.stringify(json, null, "\t") + "\n");
						}
					}
				});
			}
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
