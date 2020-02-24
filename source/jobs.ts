import * as libfs from 'fs';
import * as libpath from 'path';
import * as vobsub from './vobsub';
import * as ffmpeg from './ffmpeg';
import { MediaContent, MediaDatabase, MediaType } from './discdb';
import * as utils from './utils';

let move_files = (filenames: string[], basename: string): void => {
	basename = libpath.join(basename);
	let target_directory = ['.', 'private', 'media', ...basename.split(libpath.sep)];
	target_directory.pop();
	libfs.mkdirSync(target_directory.join(libpath.sep), { recursive: true });
	filenames.forEach((filename) => {
		filename = libpath.join(filename);
		let dirs = filename.split(libpath.sep);
		let file = dirs.pop() as string;
		let parts = file.split('.');
		let ending = parts.slice(2).join('.');
		libfs.renameSync(filename, libpath.join('.', 'private', 'media', basename + '.' + ending));
	});
};

let generate_queue = (files: Array<string>, node: string): Array<string> => {
	let stat = libfs.statSync(node);
	if (stat.isDirectory()) {
		libfs.readdirSync(node).map((subnode) => {
			return libpath.join(node, subnode);
		}).map((node) => {
			return generate_queue(files, node);
		});
	} else if (stat.isFile() && /[.]mkv$/.test(node)) {
		files.push(node);
	}
	return files;
};

let queue = generate_queue([], './private/queue/');

let db = MediaDatabase.as(JSON.parse(libfs.readFileSync("./private/db/discdb.json", "utf8")));

let get_media_info = (path: string): { type: MediaType, content: MediaContent } | null => {
	let parts = libpath.basename(path).split(".");
	if (parts.length === 3) {
		let discid = parts[0];
		let index = Number.parseInt(parts[1]);
		let media = db[discid];
		if (media != null) {
			let content = media.content[index];
			if (content != null) {
				return {
					type: media.type,
					content
				};
			}
		}
	}
	return null;
};

function getBasename(type: MediaType, content: MediaContent): string {
	if (content.type === "episode" && content.show != null && content.title != null) {
		let rn = `${utils.pathify(content.show)}-s${("00" + content.season).slice(-2)}e${("00" + content.episode).slice(-2)}-${utils.pathify(content.title)}-${utils.pathify(type)}`;
		return `video/shows/${utils.pathify(content.show)}/s${('00' + content.season).slice(-2)}/${rn}/${rn}`;
	}
	if (content.type === "movie" && content.title != null) {
		let rn = `${utils.pathify(content.title)}-${('0000' + content.year).slice(-4)}-${utils.pathify(type)}`;
		return `video/movies/${rn}/${rn}`;
	}
	throw "";
}

let pick_from_queue = (): void => {
	if (queue.length > 0) {
		let index = (Math.random() * queue.length) | 0;
		let input = queue.splice(index, 1)[0];
		const mi = get_media_info(input);
		if (mi != null) {
			const basename = getBasename(mi.type, mi.content);
			process.stdout.write(`Basename set to ${basename}\n`);
			if (mi.type === 'dvd' || mi.type === 'bluray') {
				vobsub.extract(input, basename, (outputs) => {
					ffmpeg.transcode(input, (code, output) => {
						move_files([...outputs, output], basename);
						pick_from_queue();
					}, mi.content, basename);
				});
			}
			return;
		}
		pick_from_queue();
	} else {
		process.exit(0);
	}
};

pick_from_queue();
