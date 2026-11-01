declare module "*?worker&inline" {
	const WorkerConstructor: { new (options?: WorkerOptions): Worker };
	export default WorkerConstructor;
}
declare module "*.wasm?url" {
	const url: string;
	export default url;
}
