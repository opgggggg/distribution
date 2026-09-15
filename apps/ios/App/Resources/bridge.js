"use strict";

/**
 * `window.auroraHarmonyHost` for WKWebView.
 *
 * The shared Web shell was written against Android's `@JavascriptInterface`, where
 * every bridge call returns synchronously. WKWebView has no synchronous native call:
 * `postMessage` is one-way and `WKScriptMessageHandlerWithReply` resolves a promise.
 * So the parts of the contract that must answer immediately are answered here in
 * JavaScript, and the native side only ever pushes state in or receives work orders:
 *
 *   - `consumePendingIntent` / `readOpenDocumentChunk` read buffers the host staged
 *     through `__auroraIosHost` before it announced the document, so they can return
 *     a value on the spot.
 *   - `beginSave` mints the session id itself, and `appendSaveChunk` reports success
 *     optimistically. WKWebView delivers script messages to one handler in order, so
 *     the chunks reach the host in sequence; a write that fails is remembered natively
 *     and surfaces when `finishSave` settles, which the caller already awaits.
 *
 * Injected at document start, before the payload runs, so `main.ts` sees the host.
 */
(function () {
	if (window.auroraHarmonyHost) return;

	var BINARY_STRING_CHUNK = 0x8000;

	/** Open documents stay queued until finishOpenDocument, mirroring the Android host. */
	var openDocuments = [];
	var openDocumentAdvertised = false;
	var assistantCommands = [];
	var saveSettlers = Object.create(null);

	function send(handler, name, payload) {
		var message = { name: name };
		for (var key in payload) {
			if (Object.prototype.hasOwnProperty.call(payload, key)) message[key] = payload[key];
		}
		try {
			window.webkit.messageHandlers[handler].postMessage(message);
			return true;
		} catch (cause) {
			return false;
		}
	}

	function post(name, payload) {
		return send("auroraHost", name, payload);
	}

	function postService(name, payload) {
		return send("auroraServices", name, payload);
	}

	function bytesToBase64(bytes) {
		var binary = "";
		for (var offset = 0; offset < bytes.length; offset += BINARY_STRING_CHUNK) {
			binary += String.fromCharCode.apply(
				null,
				bytes.subarray(offset, offset + BINARY_STRING_CHUNK),
			);
		}
		return btoa(binary);
	}

	function base64ToBytes(encoded) {
		var binary = atob(encoded);
		var bytes = new Uint8Array(binary.length);
		for (var index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return bytes;
	}

	function uuid() {
		if (window.crypto && typeof window.crypto.randomUUID === "function") {
			return window.crypto.randomUUID();
		}
		return "save-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
	}

	window.auroraHarmonyHost = {
		appReady: function () {
			return post("appReady");
		},

		getPlatform: function () {
			return "ios";
		},

		hasWindowControls: function () {
			return false;
		},

		// iPadOS draws no in-page window chrome for the app to move or maximise.
		startWindowMove: function () {
			return false;
		},

		toggleMaximizeWindow: function () {
			return false;
		},

		setPresentationLandscape: function (enabled) {
			return post("setPresentationLandscape", { enabled: enabled === true });
		},

		consumePendingIntent: function () {
			var pending = openDocuments[0];
			if (pending && !openDocumentAdvertised) {
				openDocumentAdvertised = true;
				return JSON.stringify({
					type: "open-document",
					id: pending.id,
					fileName: pending.fileName,
					mimeType: pending.mimeType,
					size: pending.bytes.length,
				});
			}
			return assistantCommands.length === 0 ? "" : assistantCommands.shift();
		},

		readOpenDocumentChunk: function (id, offset, length) {
			var pending = openDocuments[0];
			if (!pending || pending.id !== id || offset < 0 || length <= 0) return "";
			var end = Math.min(pending.bytes.length, offset + length);
			if (end <= offset) return "";
			return bytesToBase64(pending.bytes.subarray(offset, end));
		},

		finishOpenDocument: function (id) {
			var pending = openDocuments[0];
			if (!pending || pending.id !== id) return false;
			openDocuments.shift();
			openDocumentAdvertised = false;
			post("finishOpenDocument", { id: id });
			return true;
		},

		beginSave: function (fileName) {
			var sessionId = uuid();
			post("beginSave", { sessionId: sessionId, fileName: String(fileName || "") });
			return sessionId;
		},

		appendSaveChunk: function (sessionId, base64) {
			return post("appendSaveChunk", { sessionId: sessionId, chunk: base64 });
		},

		finishSave: function (sessionId) {
			return new Promise(function (resolve, reject) {
				saveSettlers[sessionId] = { resolve: resolve, reject: reject };
				if (!post("finishSave", { sessionId: sessionId })) {
					delete saveSettlers[sessionId];
					reject(new Error("原生容器没有响应保存请求。"));
				}
			});
		},

		abortSave: function (sessionId) {
			var settler = saveSettlers[sessionId];
			if (settler) {
				delete saveSettlers[sessionId];
				settler.reject(new Error("保存已取消。"));
			}
			return post("abortSave", { sessionId: sessionId });
		},
	};

	/**
	 * `window.cubeofficeServices` — the settings panel's client services, backed by
	 * `ClientServices.swift`. The identity is injected before this script runs, so
	 * `getInfo` answers synchronously like Android's `@JavascriptInterface`; a request is
	 * posted to the host and settled back through `__auroraIosServices`, and the caller
	 * polls `takeResult` exactly as it does on the other platforms.
	 */
	var clientInfo = window.__auroraIosClientInfo || null;
	var serviceResults = Object.create(null);
	var serviceOperations = Object.create(null);

	if (clientInfo) {
		window.cubeofficeServices = {
			getInfo: function () {
				return JSON.stringify(clientInfo);
			},

			setAutomatic: function (enabled) {
				clientInfo.automatic = enabled === true;
				postService("setAutomatic", { enabled: clientInfo.automatic });
			},

			copyClientId: function () {
				postService("copyClientId");
			},

			// An empty id means "busy" to the caller, which is also how one request per
			// operation at a time is enforced: the host never sees the second one.
			request: function (operation, input) {
				if (typeof input !== "string" || input.length > 12000) return "";
				for (var running in serviceOperations) {
					if (serviceOperations[running] === operation) return "";
				}
				var id = uuid();
				serviceOperations[id] = operation;
				if (!postService("request", { id: id, operation: operation, input: input })) {
					delete serviceOperations[id];
					return "";
				}
				return id;
			},

			takeResult: function (id) {
				var result = serviceResults[id];
				delete serviceResults[id];
				return result || "";
			},
		};
	}

	/** Private surface for WorkspaceViewController; the Web shell never calls it. */
	window.__auroraIosHost = {
		beginStagedDocument: function (id, size) {
			openDocuments.push({
				id: id,
				fileName: "",
				mimeType: "application/octet-stream",
				bytes: new Uint8Array(size),
				written: 0,
			});
		},

		stageDocumentChunk: function (id, base64) {
			for (var index = 0; index < openDocuments.length; index += 1) {
				var staged = openDocuments[index];
				if (staged.id !== id) continue;
				var bytes = base64ToBytes(base64);
				staged.bytes.set(bytes, staged.written);
				staged.written += bytes.length;
				return true;
			}
			return false;
		},

		commitStagedDocument: function (id, fileName, mimeType) {
			for (var index = 0; index < openDocuments.length; index += 1) {
				var staged = openDocuments[index];
				if (staged.id !== id) continue;
				staged.fileName = fileName;
				staged.mimeType = mimeType || "application/octet-stream";
				window.dispatchEvent(new Event("aurora-native-document"));
				return true;
			}
			return false;
		},

		enqueueAssistantCommand: function (json) {
			assistantCommands.push(json);
			window.dispatchEvent(new Event("aurora-native-document"));
			return true;
		},

		/** Delivers a client-services result; `takeResult` hands it to the caller. */
		settleServiceRequest: function (id, json) {
			if (!serviceOperations[id]) return false;
			if (serviceOperations[id] === "updates") {
				var settled = null;
				try {
					settled = JSON.parse(json);
				} catch (cause) {
					settled = null;
				}
				// The host recorded the check at the same moment; the panel reads the
				// timestamp straight back out of getInfo().
				if (settled && settled.ok === true) clientInfo.lastCheck = Date.now();
			}
			delete serviceOperations[id];
			serviceResults[id] = json;
			return true;
		},

		settleSave: function (sessionId, ok, message) {
			var settler = saveSettlers[sessionId];
			if (!settler) return false;
			delete saveSettlers[sessionId];
			if (ok) settler.resolve(sessionId);
			else settler.reject(new Error(message || "文档保存失败"));
			return true;
		},
	};
})();
