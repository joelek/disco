import * as tidalapi from "./search";
import * as rate_limiter from "../rate_limiter";
import * as libdb from "./db";
import * as libfs from "fs";
import * as api from "./search/client";
import * as autoguard from "@joelek/ts-autoguard/dist/lib-server";

function getImageURL(id: string, width: number, height: number): string {
	return "https://resources.tidal.com/images/" + id.split("-").join("/") + `/${width}x${height}.jpg`;
}

function getAlbumArtURL(id: string): string {
	return getImageURL(id, 1280, 1280);
}

function getArtistArtURL(id: string): string {
	return getImageURL(id, 750, 750);
}

function parseDate(string: string): number {
	return Date.parse(string + "Z");
}

type Artist = libdb.Artist & {

};

type Album = libdb.Album & {
	artists: Artist[];
};

type SearchResponse = {
	albums: Album[];
	artists: Artist[];
};

const path = [".", "private", "db", "tidal.json"];
const token = "gsFXkJqGrUNoYMQPZe4k3WKwijnrp8iGSwn3bApe";
const db = libdb.Database.as(JSON.parse(libfs.readFileSync(path.join("/"), "utf8")));
const rl = new rate_limiter.RateLimiter(10000);
const apiclient = api.makeClient({
	urlPrefix: "https://api.tidal.com/v1",
	requestHandler: autoguard.api.makeNodeRequestHandler()
});

export async function search(query: string, types: Array<tidalapi.EntityType>): Promise<SearchResponse> {
	await rl.rateLimit();
	let response = await apiclient.search({
		headers: {
			"x-tidal-token": token
		},
		options: {
			query,
			countryCode: "SE",
			offset: 0,
			limit: 1,
			types,
			includeContributors: true
		}
	});
	let payload = await response.payload();
	for (let album of payload.albums.items) {
		try {
			await getAlbumFromDatabase(album.id);
		} catch (error) {
			for (let artist of album.artists) {
				try {
					await getArtistFromDatabase(artist.id);
				} catch (error) {
					db.artists.push({
						id: artist.id,
						name: artist.name,
						picture: artist.picture ?? undefined
					});
				}
			}
			db.albums.push({
				id: album.id,
				title: album.title,
				cover: album.cover,
				release_date: parseDate(album.releaseDate),
				artists: album.artists.map((artist) => ({
					id: artist.id
				}))
			});
		}
	}
	for (let artist of payload.artists.items) {
		try {
			await getArtistFromDatabase(artist.id);
		} catch (error) {
			db.artists.push({
				id: artist.id,
				name: artist.name,
				picture: artist.picture ?? undefined
			});
		}
	}
	libfs.writeFileSync(path.join("/"), JSON.stringify(db, null, "\t"));
	return {
		albums: await Promise.all(payload.albums.items.map((album) => getAlbumFromDatabase(album.id))),
		artists: await Promise.all(payload.artists.items.map((album) => getArtistFromDatabase(album.id)))
	};
}

export async function getArtistFromDatabase(id: number): Promise<Artist> {
	let artists = db.artists.filter((artist) => artist.id === id);
	let artist = artists.shift();
	if (artist == null) {
		throw `Expected an artist!`;
	}
	return {
		...artist,
		picture: artist.picture != null ? getArtistArtURL(artist.picture) : undefined
	};
};

export async function getArtist(id: number): Promise<Artist> {
	try {
		return await getArtistFromDatabase(id);
	} catch (error) {}
	await rl.rateLimit();
	let response = await apiclient.getArtist({
		headers: {
			"x-tidal-token": token
		},
		options: {
			id,
			countryCode: "SE"
		}
	});
	let payload = await response.payload();
	db.artists.push({
		id: payload.id,
		name: payload.name,
		picture: payload.picture ?? undefined
	});
	libfs.writeFileSync(path.join("/"), JSON.stringify(db, null, "\t"));
	return getArtistFromDatabase(id);
};

export async function getAlbumFromDatabase(id: number): Promise<Album> {
	let albums = db.albums.filter((album) => album.id === id);
	let album = albums.shift();
	if (album == null) {
		throw `Expected an album!`;
	}
	return {
		...album,
		cover: getAlbumArtURL(album.cover),
		artists: await Promise.all(album.artists.map((artist) => getArtistFromDatabase(artist.id)))
	};
};

export async function getAlbum(id: number): Promise<Album> {
	try {
		return await getAlbumFromDatabase(id);
	} catch (error) {}
	await rl.rateLimit();
	let response = await apiclient.getAlbum({
		headers: {
			"x-tidal-token": token
		},
		options: {
			id,
			countryCode: "SE"
		}
	});
	let payload = await response.payload();
	for (let artist of payload.artists) {
		try {
			await getArtistFromDatabase(artist.id);
		} catch (error) {
			db.artists.push({
				id: artist.id,
				name: artist.name,
				picture: artist.picture ?? undefined
			});
		}
	}
	db.albums.push({
		id: payload.id,
		title: payload.title,
		cover: payload.cover,
		release_date: parseDate(payload.releaseDate),
		artists: payload.artists.map((artist) => ({
			id: artist.id
		}))
	});
	libfs.writeFileSync(path.join("/"), JSON.stringify(db, null, "\t"));
	return getAlbumFromDatabase(id);
};
