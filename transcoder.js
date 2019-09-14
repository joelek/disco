let libcp = require('child_process');
let libpath = require('path');
let libfs = require('fs');
let ffmpeg = require('./ffmpeg');
let vobsub = require('./vobsub');

let queue = [];

let archive_file = (filename) => {
  let paths = ['.', 'private', 'archive', ...filename.split(libpath.sep).slice(2) ];
  let file = paths.pop();
  libfs.mkdirSync(libpath.join(...paths), { recursive: true });
  libfs.renameSync(filename, libpath.join(...paths, file));
};

let move_file = (filename) => {
  let paths = ['.', 'private', 'media', ...filename.split(libpath.sep).slice(2) ];
  let file = paths.pop();
  libfs.mkdirSync(libpath.join(...paths), { recursive: true });
  libfs.renameSync(filename, libpath.join(...paths, file));
};

let generate_queue = (files, node) => {
  let stat = libfs.statSync(node);
  if (stat.isDirectory()) {
    libfs.readdirSync(node).map((subnode) => {
      return libpath.join(node, subnode);
    }).map((node) => {
      return generate_queue(files, node);
    });
  } else if (stat.isFile()) {
    files.push(node);
  }
  return files;
};

let pick_from_queue = () => {
  if (queue.length > 0) {
    let index = (Math.random() * queue.length) | 0;
    let input = queue.splice(index, 1)[0];
    ffmpeg.transcode(input, (code, output) => {
      archive_file(input);
      move_file(output);
      pick_from_queue();
    });
  } else {
    setTimeout(() => {
      queue = generate_queue([], './private/queue/');
      pick_from_queue();
    }, 1000*10);
  }
};

pick_from_queue();
