import * as discdb from "./discdb";

function pathify(string: string): string {
	return encodeURIComponent(string
		.split('/').join('_')
		.split(' ').join('_')
		.split('-').join('_')
		.split('ñ').join('n')
		.split(':').join('')
		.split('\'').join('')
		.split(',').join('')
		.split('.').join('')
		.split('?').join('')
		.split('&').join('and')
		.toLowerCase());
}

function foreach<A>(array: Array<A>, next: { (value: A, cb: { (): void }): void }, done: { (): void }): void {
	array = array.slice();
	let iterate = () => {
		if (array.length > 0) {
			next(array.pop() as A, iterate);
		} else {
			done();
		}
	};
	iterate();
}

function getBasename(type: discdb.MediaType, content: discdb.MediaContent): string {
	if (content.type === "episode" && content.show != null && content.title != null) {
		let rn = `${pathify(content.show)}-s${("00" + content.season).slice(-2)}e${("00" + content.episode).slice(-2)}-${pathify(content.title)}-${pathify(type)}`;
		return `video/shows/${pathify(content.show)}/s${('00' + content.season).slice(-2)}/${rn}/${rn}`;
	}
	if (content.type === "movie" && content.title != null) {
		let rn = `${pathify(content.title)}-${('0000' + content.year).slice(-4)}-${pathify(type)}`;
		return `video/movies/${rn}/${rn}`;
	}
	throw "";
}

export {
	pathify,
	foreach,
	getBasename
};
