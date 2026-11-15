/**
 * Bounds-checked big-endian cursors over PSD payloads. PSD is a length-prefixed
 * format, so both cursors expose section helpers that make "read/write body,
 * then fix up the length" the easy path.
 */

export class PsdReadError extends Error {
	constructor(
		message: string,
		readonly offset: number,
	) {
		super(`${message} (at byte ${offset})`);
		this.name = "PsdReadError";
	}
}

export class PsdByteReader {
	private readonly view: DataView;
	private readonly bytes: Uint8Array;
	offset = 0;

	constructor(buffer: ArrayBuffer | Uint8Array) {
		this.bytes =
			buffer instanceof Uint8Array
				? buffer
				: new Uint8Array(buffer, 0, (buffer as ArrayBuffer).byteLength);
		this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
	}

	get length(): number {
		return this.bytes.length;
	}

	remaining(): number {
		return this.bytes.length - this.offset;
	}

	private need(count: number): void {
		if (count < 0 || this.offset + count > this.bytes.length) {
			throw new PsdReadError(`Unexpected end of PSD data (need ${count} bytes)`, this.offset);
		}
	}

	u8(): number {
		this.need(1);
		return this.view.getUint8(this.offset++);
	}

	peekU8(): number {
		this.need(1);
		return this.view.getUint8(this.offset);
	}

	u16(): number {
		this.need(2);
		const value = this.view.getUint16(this.offset);
		this.offset += 2;
		return value;
	}

	i16(): number {
		this.need(2);
		const value = this.view.getInt16(this.offset);
		this.offset += 2;
		return value;
	}

	u32(): number {
		this.need(4);
		const value = this.view.getUint32(this.offset);
		this.offset += 4;
		return value;
	}

	i32(): number {
		this.need(4);
		const value = this.view.getInt32(this.offset);
		this.offset += 4;
		return value;
	}

	f64(): number {
		this.need(8);
		const value = this.view.getFloat64(this.offset);
		this.offset += 8;
		return value;
	}

	skip(count: number): void {
		this.need(count);
		this.offset += count;
	}

	bytesView(count: number): Uint8Array {
		this.need(count);
		const view = this.bytes.subarray(this.offset, this.offset + count);
		this.offset += count;
		return view;
	}

	bytesCopy(count: number): Uint8Array {
		return this.bytesView(count).slice();
	}

	/** Four ASCII characters, e.g. '8BPS', '8BIM', 'norm'. */
	signature(): string {
		this.need(4);
		let text = "";
		for (let i = 0; i < 4; i++) text += String.fromCharCode(this.bytes[this.offset + i]);
		this.offset += 4;
		return text;
	}

	expectSignature(expected: string): void {
		const at = this.offset;
		const actual = this.signature();
		if (actual !== expected) {
			throw new PsdReadError(`Expected signature '${expected}' but found '${actual}'`, at);
		}
	}

	/** Length-prefixed Latin-1 string padded to a multiple of `padTo` including the length byte. */
	pascalString(padTo: number): string {
		const length = this.u8();
		let text = "";
		for (const byte of this.bytesView(length)) text += String.fromCharCode(byte);
		const total = length + 1;
		const padded = Math.ceil(total / padTo) * padTo;
		this.skip(padded - total);
		return text;
	}

	/** UTF-16BE string prefixed with a u32 character count. */
	unicodeString(): string {
		return this.unicodeStringOfLength(this.u32());
	}

	unicodeStringOfLength(characters: number): string {
		let text = "";
		for (let i = 0; i < characters; i++) {
			const code = this.u16();
			if (code !== 0) text += String.fromCharCode(code);
		}
		return text;
	}

	/**
	 * Reads a u32 length prefix, hands a bounded view of the body to `parse`,
	 * and always leaves the cursor past the body plus padding, no matter how
	 * much of the body `parse` consumed. PSD stores the unpadded length; the
	 * body itself is padded to a multiple of `round` bytes.
	 */
	section<T>(round: number, parse: (body: PsdByteReader, length: number) => T): T {
		const length = this.u32();
		const body = new PsdByteReader(this.bytesView(length));
		const result = parse(body, length);
		const padded = Math.ceil(length / round) * round;
		this.skip(Math.min(padded - length, this.remaining()));
		return result;
	}
}

export class PsdByteWriter {
	private buffer = new Uint8Array(1024);
	private view = new DataView(this.buffer.buffer);
	private length = 0;

	private ensure(extra: number): void {
		const needed = this.length + extra;
		if (needed <= this.buffer.length) return;
		let capacity = this.buffer.length * 2;
		while (capacity < needed) capacity *= 2;
		const grown = new Uint8Array(capacity);
		grown.set(this.buffer.subarray(0, this.length));
		this.buffer = grown;
		this.view = new DataView(grown.buffer);
	}

	get size(): number {
		return this.length;
	}

	u8(value: number): void {
		this.ensure(1);
		this.view.setUint8(this.length, value);
		this.length += 1;
	}

	u16(value: number): void {
		this.ensure(2);
		this.view.setUint16(this.length, value);
		this.length += 2;
	}

	i16(value: number): void {
		this.ensure(2);
		this.view.setInt16(this.length, value);
		this.length += 2;
	}

	u32(value: number): void {
		this.ensure(4);
		this.view.setUint32(this.length, value);
		this.length += 4;
	}

	i32(value: number): void {
		this.ensure(4);
		this.view.setInt32(this.length, value);
		this.length += 4;
	}

	f64(value: number): void {
		this.ensure(8);
		this.view.setFloat64(this.length, value);
		this.length += 8;
	}

	zeros(count: number): void {
		this.ensure(count);
		this.length += count;
		this.buffer.fill(0, this.length - count, this.length);
	}

	bytes(data: Uint8Array): void {
		this.ensure(data.length);
		this.buffer.set(data, this.length);
		this.length += data.length;
	}

	signature(text: string): void {
		this.ensure(4);
		for (let i = 0; i < 4; i++) this.buffer[this.length + i] = text.charCodeAt(i) & 0xff;
		this.length += 4;
	}

	pascalString(text: string, padTo: number): void {
		const clamped = text.slice(0, 255);
		this.u8(clamped.length);
		for (let i = 0; i < clamped.length; i++) this.u8(clamped.charCodeAt(i) & 0xff);
		const total = clamped.length + 1;
		const padded = Math.ceil(total / padTo) * padTo;
		this.zeros(padded - total);
	}

	unicodeString(text: string): void {
		this.u32(text.length);
		for (let i = 0; i < text.length; i++) this.u16(text.charCodeAt(i));
	}

	/**
	 * Writes a u32 length placeholder, runs `body`, pads the body to a
	 * multiple of `round` bytes, then patches the length in. PSD stores the
	 * unpadded body length except for the few sections whose length field
	 * counts the padding too (`storePaddedLength`).
	 */
	section(round: number, body: () => void, storePaddedLength = false): void {
		const lengthAt = this.length;
		this.u32(0);
		const start = this.length;
		body();
		const written = this.length - start;
		const padded = Math.ceil(written / round) * round;
		this.zeros(padded - written);
		this.view.setUint32(lengthAt, storePaddedLength ? padded : written);
	}

	toBytes(): Uint8Array {
		return this.buffer.slice(0, this.length);
	}
}
