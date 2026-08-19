// Derived from @deepseek-ai/dsh-sdk-protocol (MIT) so the DeepSee bootstrap
// package does not ask npm to resolve the complete Harness peer graph before
// its installer can print a single line.
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";

export class JsonRpcResponseError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = "JsonRpcResponseError";
    this.code = code;
    this.data = data;
  }
}

export class JsonRpcLineTransport {
  constructor(input, output) {
    this.input = input;
    this.output = output;
    this.buffer = "";
    this.decoder = new StringDecoder("utf8");
    this.started = false;
    this.pending = new Map();
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.input.on("data", this.onData);
    this.input.on("error", this.onInputError);
    this.input.on("end", this.onInputEnd);
  }

  close() {
    this.input.off("data", this.onData);
    this.input.off("error", this.onInputError);
    this.input.off("end", this.onInputEnd);
    this.failPending(new Error("JSON-RPC transport closed"));
  }

  onRequest(handler) {
    this.requestHandler = handler;
  }

  onNotification(handler) {
    this.notificationHandler = handler;
  }

  request(method, params, signal) {
    const id = `req_${randomUUID().replaceAll("-", "")}`;
    return new Promise((resolve, reject) => {
      let detach = () => {};
      if (signal) {
        if (signal.aborted) {
          reject(abortError(signal.reason));
          return;
        }
        const onAbort = () => {
          this.pending.delete(id);
          reject(abortError(signal.reason));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        detach = () => signal.removeEventListener("abort", onAbort);
      }
      this.pending.set(id, {
        resolve: (value) => { detach(); resolve(value); },
        reject: (error) => { detach(); reject(error); },
      });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        this.pending.delete(id);
        detach();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  notify(method, params) {
    this.write(params === undefined
      ? { jsonrpc: "2.0", method }
      : { jsonrpc: "2.0", method, params });
  }

  flush() {
    return new Promise((resolve, reject) => {
      this.output.write("", (error) => error ? reject(error) : resolve());
    });
  }

  onData = (chunk) => {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    this.drainLines();
  };

  onInputError = (error) => this.failPending(error);

  onInputEnd = () => {
    this.buffer += this.decoder.end();
    this.drainLines();
    this.failPending(new Error("JSON-RPC input closed"));
  };

  drainLines() {
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.handleLine(line);
    }
  }

  async handleLine(line) {
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      return;
    }
    if (!frame || typeof frame !== "object") return;
    const { id, method } = frame;
    if ((typeof id === "string" || typeof id === "number") && typeof method === "string") {
      await this.handleIncomingRequest(id, method, objectParams(frame.params));
    } else if (typeof id === "string" || typeof id === "number") {
      this.handleIncomingResponse(id, frame);
    } else if (typeof method === "string") {
      this.notificationHandler?.(method, objectParams(frame.params));
    }
  }

  async handleIncomingRequest(id, method, params) {
    if (!this.requestHandler) {
      this.writeError(id, -32601, `method not found: ${method}`);
      return;
    }
    try {
      this.write({ jsonrpc: "2.0", id, result: await this.requestHandler(method, params) });
    } catch (error) {
      this.writeError(id, -32603, error instanceof Error ? error.message : String(error));
    }
  }

  handleIncomingResponse(id, frame) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (frame.error && typeof frame.error === "object") {
      pending.reject(new JsonRpcResponseError(
        typeof frame.error.code === "number" ? frame.error.code : undefined,
        typeof frame.error.message === "string" ? frame.error.message : "JSON-RPC error",
        frame.error.data,
      ));
    } else {
      pending.resolve(frame.result);
    }
  }

  writeError(id, code, message) {
    this.write({ jsonrpc: "2.0", id, error: { code, message } });
  }

  write(message) {
    this.output.write(`${JSON.stringify(message)}\n`);
  }

  failPending(error) {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const waiter of pending) waiter.reject(error);
  }
}

function objectParams(params) {
  return params && typeof params === "object" && !Array.isArray(params) ? params : {};
}

function abortError(reason) {
  return reason instanceof Error ? reason : new Error(`JSON-RPC request aborted: ${String(reason)}`);
}
