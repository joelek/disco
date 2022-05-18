import * as $fs from "fs";
import * as $db from "./db";
import * as $metadata from "../metadata";

type Movie = $db.Movie & {

};

type Show = $db.Show & {
	episodes: $db.Episode[]
};

const path = [
	".",
	"private",
	"db",
	"imdb.json"
];

const db = $db.Database.as(JSON.parse($fs.readFileSync(path.join("/"), "utf8")));

export async function getMovieFromDatabase(id: string): Promise<Movie> {
	let movies = db.movies.filter((movie) => movie.id === id);
	if (movies.length !== 1) {
		throw "Expected exactly one movie!";
	}
	let movie = movies.shift() as $db.Movie;
	return {
		...movie
	};
};

export async function getMovieFromSource(id: string): Promise<Movie> {
	let title = await new Promise<$metadata.Title>((resolve, reject) => {
		$metadata.getTitle(id, async (title) => {
			if (title == null) {
				return reject("Expected a title!");
			}
			return resolve(title);
		});
	});
	if (title.type !== "movie") {
		throw "Expected a movie!";
	}
	for (let star of title.stars) {
		let actor = db.actors.find((actor) => actor.id === star.id);
		if (actor == null) {
			db.actors.push({
				...star
			});
		}
	}
	db.movies.push({
		id: title.id,
		title: title.title,
		year: title.year || 0,
		summary: title.description,
		poster_url: title.image_url,
		genres: title.genres,
		actors: title.stars.map((star) => star.name),
		actor_ids: title.stars.map((star) => star.id)
	});
	$fs.writeFileSync(path.join("/"), JSON.stringify(db, null, "\t"));
	return getMovieFromDatabase(id);
};

export async function getMovie(id: string): Promise<Movie> {
	try {
		return await getMovieFromDatabase(id);
	} catch (error) {}
	return getMovieFromSource(id);
};

/* getMovie("tt0201265").then(console.log); */

export async function getShowFromDatabase(id: string): Promise<Show> {
	let shows = db.shows.filter((show) => show.id === id);
	if (shows.length !== 1) {
		throw "Expected exactly one show!";
	}
	let show = shows.shift() as $db.Show;
	let episodes = db.episodes.filter((episode) => episode.show_id === show.id);
	return {
		...show,
		episodes
	};
};

export async function getShowFromSource(id: string): Promise<Show> {
	let title = await new Promise<$metadata.Title>((resolve, reject) => {
		$metadata.getTitle(id, async (title) => {
			if (title == null) {
				return reject("Expected a title!");
			}
			return resolve(title);
		});
	});
	if (title.type !== "show") {
		throw "Expected a show!";
	}
	for (let star of title.stars) {
		let actor = db.actors.find((actor) => actor.id === star.id);
		if (actor == null) {
			db.actors.push({
				...star
			});
		}
	}
	db.shows.push({
		id: title.id,
		title: title.title,
		summary: title.description,
		poster_url: title.image_url,
		genres: title.genres,
		actors: title.stars.map((star) => star.name),
		actor_ids: title.stars.map((star) => star.id)
	});
	for (let i = 1; true; i++) {
		try {
			let season = await new Promise<$metadata.Season>((resolve, reject) => {
				$metadata.getSeason(id, i, async (season) => {
					if (season == null) {
						return reject("Expected a season!");
					}
					return resolve(season);
				});
			});
			for (let episode of season.episodes) {
				if (episode.air_date_timestamp < Date.now()) {
					db.episodes.push({
						id: episode.id,
						title: episode.title,
						air_date: episode.air_date_timestamp,
						summary: episode.description,
						show_id: id,
						season: season.season_number,
						episode: episode.episode_number
					});
				}
			}
		} catch (error) {
			break;
		}
	}
	$fs.writeFileSync(path.join("/"), JSON.stringify(db, null, "\t"));
	return getShowFromDatabase(id);
};

export async function getShow(id: string): Promise<Show> {
	try {
		return await getShowFromDatabase(id);
	} catch (error) {}
	return getShowFromSource(id);
};
