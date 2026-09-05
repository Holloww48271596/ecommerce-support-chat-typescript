import assert from "node:assert/strict";
import { shouldNotifyCustomer } from "../src/support_chat.js";

assert.equal(shouldNotifyCustomer({ orderId: "a1", status: "shipped" }), true);
assert.equal(shouldNotifyCustomer({ orderId: "a1", status: "packed" }), false);
console.log("order notification decision: ok");
