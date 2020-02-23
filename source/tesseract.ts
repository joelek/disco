import * as libcp from "child_process";

interface Callback<A> {
	(value: A): void
}

function getSupportedLanguages(cb: Callback<Array<string>>): void {
	let options = [
		"tesseract",
		"--list-langs"
	];
	libcp.exec(options.join(" "), (error, stdout, stderr) => {
		let lines = stdout.split(/\r\n|\n|\r/);
		lines = lines.slice(1, -1);
		return cb(lines);
	});
}

export {
	getSupportedLanguages
};
