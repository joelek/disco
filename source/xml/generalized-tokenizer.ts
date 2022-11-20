export type Expression = RegExp;

export type Expressions<A extends Expressions<A>> = {
	[B in Extract<keyof A, string>]: RegExp;
};

export type Token<A extends string> = {
	row: number;
	col: number;
	type: A;
	value: string;
};

export class UnexpectedEndError {
	constructor() {}

	toString(): string {
		return `Unexpectedly reached end of token list!`;
	}
};

export class UnexpectedTokenError {
	protected token: Token<string>;

	constructor(token: Token<string>) {
		this.token = token;
	}

	toString(): string {
		return `Unexpected token "${this.token.type}" at row ${this.token.row}, col ${this.token.col}!`;
	}
};

export class UnrecognizedTokenError {
	protected row: number;
	protected col: number;

	constructor(row: number, col: number) {
		this.row = row;
		this.col = col;
	}

	toString(): string {
		return `Unrecognized token at row ${this.row}, col ${this.col}!`;
	}
};

export class Parser<A extends Expressions<A>> {
	protected expressions: Expressions<A>;
	protected tokens: Array<Token<Extract<keyof A, string>>>;
	protected offset: number;
	protected boundRead = this.read.bind(this);
	protected boundPeek = this.peek.bind(this);

	protected peek(): Token<Extract<keyof A, string>>;
	protected peek<B extends Extract<keyof A, string>[]>(...accepted_types: [...B]): Token<[...B][number]> | undefined;
	protected peek<B extends Extract<keyof A, string>[]>(...accepted_types: [...B]): Token<[...B][number]> | undefined {
		if (this.offset >= this.tokens.length) {
			return;
		}
		let token = this.tokens[this.offset];
		if (accepted_types.length === 0) {
			return { ...token };
		}
		for (let accepted_type of accepted_types) {
			if (token.type === accepted_type) {
				return { ...token };
			}
			if (this.expressions[accepted_type].test(token.value)) {
				return {
					...token,
					type: accepted_type
				};
			}
		}
	}

	protected read(): Token<Extract<keyof A, string>>;
	protected read<B extends Extract<keyof A, string>[]>(...accepted_types: [...B]): Token<[...B][number]>;
	protected read<B extends Extract<keyof A, string>[]>(...accepted_types: [...B]): Token<[...B][number]> {
		if (this.offset >= this.tokens.length) {
			throw new UnexpectedEndError();
		}
		let token = this.tokens[this.offset];
		if (accepted_types.length === 0) {
			return { ...token };
		}
		for (let accepted_type of accepted_types) {
			if (token.type === accepted_type) {
				return { ...token };
			}
			if (this.expressions[accepted_type].test(token.value)) {
				return {
					...token,
					type: accepted_type
				};
			}
		}
		throw new UnexpectedTokenError(token);
	}

	constructor(expressions: Expressions<A>, tokens: Array<Token<Extract<keyof A, string>>>) {
		this.expressions = expressions;
		this.tokens = tokens;
		this.offset = 0;
	}

	parse<B>(producer: (read: typeof this.read, peek: typeof this.peek) => B): B {
		let offset = this.offset;
		try {
			return producer(this.boundRead, this.boundPeek);
		} catch (error) {
			this.offset = offset;
			throw error;
		}
	}
};

export class Tokenizer<A extends Expressions<A>> {
	protected expressions: A;

	constructor(expressions: A) {
		this.expressions = {} as A;
		for (let type in expressions) {
			let expression = expressions[type];
			this.expressions[type] = new RegExp(`^(${expression.source})`, `${expression.ignoreCase ? "i" : ""}su`) as any;
		}
	}

	tokenize(string: string): Parser<A> {
		let tokens = [] as Array<Token<Extract<keyof A, string>>>;
		let row = 1;
		let col = 1;
		while (string.length > 0) {
			let token: Token<Extract<keyof A, string>> | undefined;
			for (let type in this.expressions) {
				let parts = this.expressions[type].exec(string);
				if (parts == null) {
					continue;
				}
				let value = parts[1];
				if (token == null) {
					token = {
						row,
						col,
						type,
						value
					};
					continue;
				}
				if (value.length > token.value.length) {
					token = {
						row,
						col,
						type,
						value
					};
					continue;
				}
			}
			if (token == null) {
				throw new UnrecognizedTokenError(row, col);
			}
			tokens.push(token);
			string = string.slice(token.value.length);
			let lines = token.value.split(/\r?\n/);
			if (lines.length > 1) {
				row += lines.length - 1;
				col = 1;
			}
			col += lines[lines.length - 1].length;
		}
		let expressions = {} as A;
		for (let type in this.expressions) {
			let expression = this.expressions[type];
			expressions[type] = new RegExp(`^(${expression.source})$`, `${expression.ignoreCase ? "i" : ""}su`) as any;
		}
		return new Parser<A>(expressions, tokens);
	}
};
