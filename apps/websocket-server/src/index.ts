import http from "http";
import 'dotenv/config';
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL?.trim();
const pubSubClient = redisUrl ? createClient({ url: redisUrl }) : createClient();

const PORT = Number(process.env.PORT) || 5000;

const server = http.createServer();
const wss = new WebSocketServer({ server });

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;
// Heartbeat timeout (10 seconds to respond)
const HEARTBEAT_TIMEOUT = 10000;

// Extended WebSocket type with heartbeat tracking
interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
  heartbeatTimeout?: NodeJS.Timeout;
}

// Storage for rooms and their users / metadata
// Shape:
// {
//   [roomId]: {
//     users: { userId, ws, name }[],
//     activeTypistId?: string
//   }
// }
const rooms: any = {};

/** Consistent JSON shape so clients never get number/string id drift and duplicate rows. */
function publicUserRow(u: { userId: string; name: string; clientId?: string }) {
  return {
    id: String(u.userId),
    name: u.name,
    clientId: u.clientId,
  };
}

function generateRoomId() {
  let id;
  do {
    // Generate an 8-digit numeric room ID instead of 6 digits
    // to significantly reduce the chance of collisions as more
    // users and rooms are created.
    id = Math.floor(10000000 + Math.random() * 90000000).toString(); 
  } while (rooms[id]);
  return id;
}

async function attachWebSocketHandlers() {
  pubSubClient.on("error", (err) =>
    console.log("Redis PubSub Client Error", err)
  );

  // Heartbeat interval to detect dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      const extWs = client as ExtendedWebSocket;
      if (extWs.isAlive === false) {
        console.log("Terminating dead connection");
        return extWs.terminate();
      }
      extWs.isAlive = false;
      extWs.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  wss.on("connection", (ws, req) => {
    const extWs = ws as ExtendedWebSocket;
    extWs.isAlive = true;
    
    // Handle pong responses
    extWs.on("pong", () => {
      extWs.isAlive = true;
    });
    
    console.log("Connection established");

    const queryParams = new URLSearchParams(req.url?.split("?")[1]);
    let roomId = queryParams.get("roomId"); // Get roomId from query param if provided
    const userId = queryParams.get("id"); // Get userId from query param
    const name = queryParams.get("name"); // Get name from query param
    /** Per-tab id so the same user account can have multiple clients in one room. */
    const clientId =
      queryParams.get("clientId")?.trim() ||
      `srv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    console.log("User id", userId);
    console.log("Room id", roomId);
    console.log("Name", name, "clientId", clientId);

    // If no roomId provided, generate a new roomId
    if (roomId == null || roomId == "") {
      roomId = generateRoomId();
      rooms[roomId] = { users: [], activeTypistId: undefined };
      ws.send(
        JSON.stringify({
          isNewRoom: true,
          type: "roomId",
          roomId,
          message: `Created new room with ID: ${roomId}`,
        })
      );
      console.log(`Created new room with ID: ${roomId}`);
    } else {
      // RoomId provided - create room entry in memory if it doesn't exist
      // (room existence is validated by database on frontend via /room/join)
      if (!rooms[roomId]) {
        rooms[roomId] = { users: [], activeTypistId: undefined };
        console.log(`Creating room entry in memory for existing room: ${roomId}`);
      }
      console.log(`Joining room with ID: ${roomId}`);
      ws.send(
        JSON.stringify({
          isNewRoom: false,
          type: "roomId",
          roomId,
          message: `Joined room with ID: ${roomId}`,
        })
      );
    }
    rooms[roomId].users.push({ userId, ws, name, clientId });

    // Broadcast the full list (including the connection just added) to everyone in the room.
    const allUsers = rooms[roomId].users.map((user: any) => publicUserRow(user));
    const usersPayload = {
      type: "users",
      users: allUsers,
      activeTypistId: rooms[roomId].activeTypistId ?? null,
    };
    rooms[roomId].users.forEach((user: any) => {
      user.ws.send(JSON.stringify(usersPayload));
    });

    // If there is no active typist yet, claim the role for the first user.
    if (!rooms[roomId].activeTypistId) {
      rooms[roomId].activeTypistId = userId;
    }
    // Always notify everyone who the current active typist is.
    rooms[roomId].users.forEach((user: any) => {
      user.ws.send(
        JSON.stringify({
          type: "activeTypist",
          activeTypistId: rooms[roomId].activeTypistId,
        })
      );
    });
    console.log("all room", rooms);

    try {
      pubSubClient.subscribe(roomId, (message) => {
        // Broadcast message to all users in the room
        const { result, sessionId } = JSON.parse(message);
        rooms[roomId].users.forEach((user: any) => {
          if (user.userId === userId) {
            user.ws.send(JSON.stringify({
              type: "output",
              message: result,
              sessionId
            }));
            console.log("Output sent to user id", user.userId, "with sessionId", sessionId);
          }
        });
      });
    } catch (err) {
      console.log("Redis subscribe skipped for room", roomId, err);
    }

    ws.on("message", (message) => {
      const data = JSON.parse(message.toString());

      console.log("Message received", data.type);

      // handle request from user and send it all back to all users in the room
      if (data.type === "requestToGetUsers") {
        const users = rooms[roomId].users.map((user: any) => publicUserRow(user));
        console.log("request recived");

        const payload = {
          type: "users",
          users,
          activeTypistId: rooms[roomId].activeTypistId ?? null,
        };
        rooms[roomId].users.forEach((user: any) => {
          user.ws.send(JSON.stringify(payload));
        });
      }

      // request for starter data on new user join
      if (data.type == "requestForAllData") {
        const otherUser = rooms[roomId].users.find(
          (user: any) => user.ws !== ws
        );
        if (otherUser) {
          console.log("sending request to", otherUser.name);
          otherUser.ws.send(
            JSON.stringify({
              type: "requestForAllData",
              userId: userId,
              clientId: clientId,
            })
          );
        }
      }

      // handle code change and send it to all users in the room
      if (data.type === "code") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.ws !== ws) {
            user.ws.send(JSON.stringify({ type: "code", code: data.code }));
          }
        });
      }
      // handle input change and send it to all users in the room
      if (data.type === "input") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.ws !== ws) {
            user.ws.send(JSON.stringify({ type: "input", input: data.input }));
          }
        });
      }

      // handle language change and send it to all users in the room
      if (data.type === "language") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.ws !== ws) {
            user.ws.send(
              JSON.stringify({ type: "language", language: data.language })
            );
          }
        });
      }

      // handle submit button status
      if (data.type === "submitBtnStatus") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.ws !== ws) {
            user.ws.send(
              JSON.stringify({
                type: "submitBtnStatus",
                value: data.value,
                isLoading: data.isLoading,

              })
            );
          }
        });
      }

      // Ignore client-originated { type: "users" } — only the server may broadcast
      // the real room list (avoids stale or crafted lists overwriting state).

      // send all data to new user
      if (data.type === "allData") {
        rooms[roomId].users.forEach((user: any) => {
          const toClientId = data.toClientId;
          if (toClientId) {
            if (user.clientId === toClientId) {
              console.log("sending all data to client", toClientId, "and data is", data);
              user.ws.send(
                JSON.stringify({
                  type: "allData",
                  code: data.code,
                  input: data.input,
                  language: data.language,
                  currentButtonState: data.currentButtonState,
                  isLoading: data.isLoading,
                  ioSessions: data.ioSessions,
                  activeIoSessionId: data.activeIoSessionId,
                })
              );
            }
            return;
          }
          if (user.userId === data.userId) {
            console.log("sending all data to", user.name, "and data is", data);
            user.ws.send(
              JSON.stringify({
                type: "allData",
                code: data.code,
                input: data.input,
                language: data.language,
                currentButtonState: data.currentButtonState,
                isLoading: data.isLoading,
                ioSessions: data.ioSessions,
                activeIoSessionId: data.activeIoSessionId,
              })
            );
          }
        });
      }

      // send current cursor position to all users in the room
      if (data.type === "cursorPosition") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.ws !== ws) {
            user.ws.send(
              JSON.stringify({
                type: "cursorPosition",
                cursorPosition: data.cursorPosition,
                userId: userId,
              })
            );
          }
        });
      }

      // Learning room / Monaco: { lineNumber, column, userName? }
      if (data.type === "editor-cursor") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.ws !== ws) {
            user.ws.send(
              JSON.stringify({
                type: "editor-cursor",
                userId,
                userName: name,
                lineNumber: data.lineNumber,
                column: data.column,
              })
            );
          }
        });
      }

      // WebRTC voice: forward to exactly one peer (prefer toClientId)
      if (data.type === "voice-signal" && (data.toClientId || data.toUserId)) {
        const me = rooms[roomId].users.find((u: any) => u.ws === ws);
        let target: { ws: WebSocket; clientId?: string } | undefined;
        if (data.toClientId) {
          target = rooms[roomId].users.find(
            (u: any) => u.clientId === data.toClientId
          );
        } else {
          target = rooms[roomId].users.find(
            (u: any) => u.userId === data.toUserId
          );
        }
        if (target) {
          target.ws.send(
            JSON.stringify({
              type: "voice-signal",
              fromUserId: userId,
              fromName: name,
              fromClientId: me?.clientId,
              payload: data.payload,
            })
          );
        }
      }

      if (data.type === "voice-state") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.ws !== ws) {
            user.ws.send(
              JSON.stringify({
                type: "voice-state",
                userId,
                name,
                clientId,
                muted: !!data.muted,
                inVoice: data.inVoice !== false,
              })
            );
          }
        });
      }

      if (data.type === "voice-join") {
        const me = rooms[roomId].users.find((u: any) => u.ws === ws);
        rooms[roomId].users.forEach((user: any) => {
          if (user.ws !== ws) {
            user.ws.send(
              JSON.stringify({
                type: "voice-join",
                userId,
                name,
                clientId: me?.clientId,
              })
            );
          }
        });
      }

      // handle chat message and broadcast to all users in the room
      if (data.type === "chat") {
        const chatMessage = {
          userId: userId,
          userName: name,
          message: data.message,
          timestamp: new Date().toISOString(),
        };

        // Broadcast to all users in the room (including sender)
        rooms[roomId].users.forEach((user: any) => {
          user.ws.send(
            JSON.stringify({
              type: "chat",
              chatMessage: chatMessage,
            })
          );
        });
      }

      // Handle AI assistant chat messages and broadcast to everyone in the room.
      // The frontend sends already-constructed message objects (user + AI),
      // and all connected users append them to their local AI chat state so
      // everyone shares the same AI conversation.
      if (data.type === "aiMessages" && Array.isArray(data.messages)) {
        rooms[roomId].users.forEach((user: any) => {
          // Do NOT echo back to the sender connection; sender already has local state.
          if (user.ws !== ws) {
            user.ws.send(
              JSON.stringify({
                type: "aiMessages",
                messages: data.messages,
              })
            );
          }
        });
      }
      // ----- Learning-specific collaboration rules -----
      // Only one active typist at a time. Others can request control.
      if (data.type === "requestTypingControl") {
        // For now we use a simple policy:
        // - If no active typist, grant control to requester.
        // - If requester is already active typist, nothing to do.
        // - Otherwise, transfer control immediately.
        // This can be extended later to require approval.
        rooms[roomId].activeTypistId = userId;
        rooms[roomId].users.forEach((user: any) => {
          user.ws.send(
            JSON.stringify({
              type: "activeTypist",
              activeTypistId: rooms[roomId].activeTypistId,
            })
          );
        });
      }
      if (data.type === "releaseTypingControl") {
        // If the current typist releases control, clear it.
        if (rooms[roomId].activeTypistId === userId) {
          rooms[roomId].activeTypistId = undefined;
          rooms[roomId].users.forEach((user: any) => {
            user.ws.send(
              JSON.stringify({
                type: "activeTypist",
                activeTypistId: rooms[roomId].activeTypistId,
              })
            );
          });
        }
      }

      // When one user starts a learning module for the room, notify everyone
      // so that all clients can navigate into the learning experience.
      if (data.type === "startLearningModule") {
        rooms[roomId].users.forEach((user: any) => {
          user.ws.send(
            JSON.stringify({
              type: "enterLearningModule",
              moduleId: data.moduleId,
            })
          );
        });
      }
    });

    ws.on("close", () => {
      rooms[roomId].users = rooms[roomId].users.filter(
        (user: any) => user.ws !== ws
      );

      if (rooms[roomId].activeTypistId === userId) {
        const stillHasUser = rooms[roomId].users.some(
          (u: any) => u.userId === userId
        );
        if (!stillHasUser) {
          rooms[roomId].activeTypistId = undefined;
        }
      }

      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
        try {
          pubSubClient.unsubscribe(roomId);
        } catch (e) {
          console.log("unsubscribe", roomId, e);
        }
        return;
      }

      const usersPayload = rooms[roomId].users.map((u: any) => publicUserRow(u));
      rooms[roomId].users.forEach((user: any) => {
        user.ws.send(
          JSON.stringify({
            type: "users",
            users: usersPayload,
            activeTypistId: rooms[roomId].activeTypistId ?? null,
          })
        );
      });

      console.log("all room", rooms);
    });
  });

  wss.on("listening", () => {
    const addr: any = server.address();
    console.log(`Server listening on port ${addr.port}`);
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`WebSocket server started on ${PORT}`);
  });
}
async function main() {
  try {
    await pubSubClient.connect();
<<<<<<< HEAD
=======
    await attachWebSocketHandlers();
>>>>>>> deployment
    console.log("Redis Client Connected");
  } catch (error) {
    console.log("Failed to connect to Redis (WebSocket will still start; code execution pub/sub may be limited)", error);
  }
  await process();
}

main();
