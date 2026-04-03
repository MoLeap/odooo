import { getWebSocketWorker } from "@bus/../tests/mock_websocket";
import { advanceTime, describe, expect, test } from "@odoo/hoot";
import { runAllTimers } from "@odoo/hoot-dom";
import { makeMockServer, MockServer, patchWithCleanup } from "@web/../tests/web_test_helpers";

import { WEBSOCKET_CLOSE_CODES, WebsocketWorker } from "@bus/workers/websocket_worker";

describe.current.tags("headless");

/**
 * @param {ReturnType<getWebSocketWorker>} worker
 * @param {(type: string, message: any) => any} [onBroadcast]
 */
const startWebSocketWorker = async (onBroadcast) => {
    await makeMockServer();
    const worker = getWebSocketWorker();
    if (onBroadcast) {
        patchWithCleanup(worker, {
            broadcast(...args) {
                onBroadcast(...args);
                return super.broadcast(...args);
            },
        });
    }
    worker._start();
    await runAllTimers();
    return worker;
};

test("connect event is broadcasted after calling start", async () => {
    await startWebSocketWorker((type) => {
        if (type !== "BUS:WORKER_STATE_UPDATED") {
            expect.step(`broadcast ${type}`);
        }
    });
    await expect.waitForSteps(["broadcast BUS:CONNECT"]);
});

test("disconnect event is broadcasted", async () => {
    const worker = await startWebSocketWorker((type) => {
        if (type !== "BUS:WORKER_STATE_UPDATED") {
            expect.step(`broadcast ${type}`);
        }
    });
    await expect.waitForSteps(["broadcast BUS:CONNECT"]);
    worker.websocket.close(WEBSOCKET_CLOSE_CODES.CLEAN);
    await runAllTimers();
    await expect.waitForSteps(["broadcast BUS:DISCONNECT"]);
});

test("reconnecting/reconnect event is broadcasted", async () => {
    const worker = await startWebSocketWorker((type) => {
        if (type !== "BUS:WORKER_STATE_UPDATED") {
            expect.step(`broadcast ${type}`);
        }
    });
    await expect.waitForSteps(["broadcast BUS:CONNECT"]);
    worker.websocket.close(WEBSOCKET_CLOSE_CODES.ABNORMAL_CLOSURE);
    await expect.waitForSteps(["broadcast BUS:DISCONNECT", "broadcast BUS:RECONNECTING"]);
    await runAllTimers();
    await expect.waitForSteps(["broadcast BUS:RECONNECT"]);
});

test("notification event is broadcasted", async () => {
    const notifications = [
        {
            id: 70,
            message: {
                type: "bundle_changed",
                payload: {
                    server_version: "15.5alpha1+e",
                },
            },
        },
    ];
    await startWebSocketWorker((type, message) => {
        if (type === "BUS:NOTIFICATION") {
            expect(message).toEqual(notifications);
        }
        if (["BUS:CONNECT", "BUS:NOTIFICATION"].includes(type)) {
            expect.step(`broadcast ${type}`);
        }
    });
    await expect.waitForSteps(["broadcast BUS:CONNECT"]);
    for (const serverWs of MockServer.current._websockets) {
        serverWs.send(JSON.stringify(notifications));
    }
    await expect.waitForSteps(["broadcast BUS:NOTIFICATION"]);
});

test("disconnect event is sent when stopping the worker", async () => {
    const worker = await startWebSocketWorker((type) => {
        if (type !== "BUS:WORKER_STATE_UPDATED") {
            expect.step(`broadcast ${type}`);
        }
    });
    await expect.waitForSteps(["broadcast BUS:CONNECT"]);
    worker._stop();
    await runAllTimers();
    await expect.waitForSteps(["broadcast BUS:DISCONNECT"]);
});

test("check connection health during inactivity", async () => {
    const ogSocket = window.WebSocket;
    let waitingForCheck = true;
    const newSocket = function () {
        const ws = new ogSocket(...arguments);
        ws.send = (message) => {
            if (waitingForCheck && message instanceof Uint8Array) {
                expect.step("check_connection_health_sent");
                waitingForCheck = false;
            }
        };
        return ws;
    };
    Object.assign(newSocket, ogSocket);
    patchWithCleanup(window, { WebSocket: newSocket });
    patchWithCleanup(WebsocketWorker.prototype, {
        enableCheckInterval: true,
        _restartConnectionCheckInterval() {
            expect.step("_restartConnectionCheckInterval");
            super._restartConnectionCheckInterval();
        },
        _sendToServer(payload) {
            if (payload.event_name === "foo") {
                super._sendToServer(payload);
            }
        },
    });
    const worker = await startWebSocketWorker((type) => {
        if (type === "BUS:CONNECT") {
            expect.step(`broadcast ${type}`);
        }
    });
    await expect.waitForSteps(["broadcast BUS:CONNECT", "_restartConnectionCheckInterval"]);
    worker.websocket.dispatchEvent(
        new MessageEvent("message", {
            data: JSON.stringify([{ id: 70, message: { type: "foo" } }]),
        })
    );
    await expect.waitForSteps(["_restartConnectionCheckInterval"]);
    worker._sendToServer({ event_name: "foo" });
    await expect.waitForSteps(["_restartConnectionCheckInterval"]);
    await advanceTime(worker.CONNECTION_CHECK_DELAY + 1000);
    await expect.waitForSteps(["check_connection_health_sent"]);
});

test("debounced updates respect force and batching", async () => {
    patchWithCleanup(WebsocketWorker, { OUTGOING_BATCH_DELAY: 120_000 });
    patchWithCleanup(WebsocketWorker.prototype, {
        _updateChannels({ force } = {}) {
            expect.step(force ? "update_channels_forced" : "update_channels");
            super._updateChannels(...arguments);
        },
    });
    await makeMockServer();
    const worker = getWebSocketWorker();
    patchWithCleanup(worker, {
        _debouncedUpdateChannels() {
            super._debouncedUpdateChannels(...arguments);
            expect.step("debounced_update_channels");
        },
        _debouncedForceUpdateChannels() {
            super._debouncedForceUpdateChannels();
            expect.step("force_update_channel");
        },
    });
    const client = new MessagePort();
    worker.registerClient(client);
    worker._start();
    await expect.waitForSteps(["debounced_update_channels"]);
    await advanceTime(120_000);
    await expect.waitForSteps(["update_channels"]);
    // 1 add channel => force => only one forced subscribe
    worker._addChannel(client, "C1");
    worker._debouncedForceUpdateChannels();
    await expect.waitForSteps(["debounced_update_channels", "force_update_channel"]);
    await advanceTime(120_000);
    await expect.waitForSteps(["update_channels_forced"]);
    // 2 multiple adds => only one subscribe
    worker._addChannel(client, "C2");
    worker._addChannel(client, "C3");
    await expect.waitForSteps(["debounced_update_channels", "debounced_update_channels"]);
    await advanceTime(120_000);
    await expect.waitForSteps(["update_channels"]);
    // 3 force => add => only one subscribe forced
    worker._debouncedForceUpdateChannels();
    worker._addChannel(client, "C5");
    await expect.waitForSteps(["force_update_channel", "debounced_update_channels"]);
    await advanceTime(120_000);
    await expect.waitForSteps(["update_channels_forced"]);
});
