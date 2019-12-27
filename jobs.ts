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
		let file = dirs.pop();
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

let get_media_info = (path: string): { type: MediaType, content: MediaContent | undefined } => {
	let parts = libpath.basename(path).split(".");
	let discid = parts[0];
	let index = Number.parseInt(parts[1]);
	let media = db[discid];
	if (media !== undefined) {
		let content = media.content[index];
		if (content !== undefined) {
			return {
				type: media.type,
				content
			};
		}
	}
	return {
		type: "neither",
		content: undefined
	};
};

let archive_file = (path: string): void => {
	let dirs = path.split(libpath.sep);
	let file = dirs.pop();
	libfs.renameSync(path, libpath.join('./private/archive/', file));
};

let pick_from_queue = (): void => {
	if (queue.length > 0) {
		let index = (Math.random() * queue.length) | 0;
		let input = queue.splice(index, 1)[0];
		let mi = get_media_info(input);
		if (mi) {
			let basename = null;
			let ct = mi.content;
			if (ct.type === 'episode') {
				let rn = `${utils.pathify(ct.show)}-s${('00' + ct.season).slice(-2)}e${('00' + ct.episode).slice(-2)}-${utils.pathify(ct.title)}-${utils.pathify(mi.type)}`;
				basename = `video/shows/${utils.pathify(ct.show)}/s${('00' + ct.season).slice(-2)}/${rn}/${rn}`;
				basename = libpath.join(basename);
			} else if (ct.type === 'movie') {
				let rn = `${utils.pathify(ct.title)}-${('0000' + ct.year).slice(-4)}-${utils.pathify(mi.type)}`;
				basename = `video/movies/${rn}/${rn}`;
				basename = libpath.join(basename);
			}
			process.stdout.write(`Basename set to ${basename}\n`);
			if (mi.type === 'dvd' || mi.type === 'bluray') {
				vobsub(input, (outputs) => {
					ffmpeg.transcode(input, (code, output) => {
						if (basename) {
							move_files([...outputs, output], basename);
						}
						archive_file(input);
						pick_from_queue();
					}, ct, basename);
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
