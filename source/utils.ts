import * as discdb from "./discdb";
import * as libfs from "fs";

function pathify(string: string): string {
	return string
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\|\/\\\_\-]/g, " ")
		.replace(/[^a-z0-9 ]/g, "")
		.trim()
		.replace(/[ ]+/g, "_");
}

function foreach<A>(array: Array<A>, next: { (value: A, cb: { (): void }): void }, done: { (): void }): void {
	array = array.slice();
	let iterate = () => {
		if (array.length > 0) {
			next(array.shift() as A, iterate);
		} else {
			done();
		}
	};
	iterate();
}

function getBasename(type: discdb.MediaType, content: discdb.MediaContent): string {
	if (discdb.EpisodeContent.is(content)) {
		let rn = `${pathify(content.show)}-s${("00" + content.season).slice(-2)}e${("00" + content.episode).slice(-2)}-${pathify(content.title)}-${pathify(type)}`;
		return `./private/media/video/shows/${pathify(content.show)}/s${('00' + content.season).slice(-2)}/${rn}/${rn}`;
	}
	if (discdb.MovieContent.is(content)) {
		let title = pathify(content.title);
		let dir = title.substr(0, 1);
		let rn = `${title}-${('0000' + content.year).slice(-4)}-${pathify(type)}`;
		return `./private/media/video/movies/${dir}/${rn}/${("00" + content.part).slice(-2)}-${rn}`;
	}
	throw "";
}

function loadDatabase<A>(path: string, guard: { (subject: any): A }): A {
	return guard(JSON.parse(libfs.readFileSync(path, "utf8")));
}

export {
	pathify,
	foreach,
	getBasename,
	loadDatabase
};
