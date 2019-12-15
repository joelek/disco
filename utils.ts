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
		.split('&').join('and')
		.toLowerCase());
}

export {
	pathify
};
