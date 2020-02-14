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
			next(array.pop(), iterate);
		} else {
			done();
		}
	};
	iterate();
}

export {
	pathify,
	foreach
};
