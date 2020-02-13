function isString(value: any): value is string {
	return value != null && value.constructor === String;
}

interface Producer<A> {
	(reader: Reader): A;
}

interface Token {
	consume(): string;
	discard(): void;
}

class Reader {
	private string: string;
	private offset: number;
	private length: number;
	private token: Token | null;

	constructor(string: string) {
		this.string = string;
		this.offset = 0;
		this.length = string.length;
		this.token = null;
	}

	done(): boolean {
		return (this.offset === this.length);
	}

	line(): string {
		let string = "";
		while (!this.done()) {
			let one = this.string[this.offset];
			this.offset += 1;
			if (false) {
			} else if (one === "\r") {
				if (!this.done()) {
					let two = this.string[this.offset];
					if (two === "\n") {
						this.offset += 1;
					}
				}
				break;
			} else if (one === "\n") {
				if (!this.done()) {
					let two = this.string[this.offset];
					if (two === "\r") {
						this.offset += 1;
					}
				}
				break;
			} else {
				string += one;
			}
		}
		return string;
	}

	peek(how: string | number): string {
		let length = isString(how) ? how.length : how;
		let min = Math.min(this.offset, this.offset + length);
		let max = Math.max(this.offset, this.offset + length);
		if ((min < 0) || (min >= this.length) || (max < 0) || (max > this.length)) {
			throw "Unable to read between offsets " + min + " and " + max + " because length is " + this.length + "!";
		}
		let string = this.string.substring(min, max);
		if (isString(how)) {
			if (string !== how) {
				throw "Expected \"" + how + "\" but read \"" + string + "\"!";
			}
		}
		return string;
	}

	read(how: string | number): string {
		let string = this.peek(how);
		this.offset += string.length;
		return string;
	}

	readToken(length: number): Token {
		if (this.token !== null) {
			throw "Unable to distribute new token!";
		}
		let string = this.peek(length);
		let token = {
			consume: (): string => {
				this.offset += string.length;
				this.token = null;
				return string;
			},
			discard: () => {
				this.token = null;
			}
		};
		this.token = token;
		return token;
	}

	seek(offset: number): void {
		if ((offset < 0) || (offset >= this.length)) {
			throw "Unable to seek to offset " + offset + " because length is " + this.length + "!";
		}
		this.offset = offset;
	}

	try<A>(producers: Array<Producer<A>>): A {
		let offset = this.offset;
		for (let producer of producers) {
			try {
				return producer(this);
			} catch (error) {
				this.offset = offset;
			}
		}
		throw "Unable to produce!";
	}

	tell(): number {
		return this.offset;
	}
}

export {
	Reader
};
