// import { getTimer, updateTimer, Timer } from "./backend/timers";

export async function handler(event: any, context: any) {
    console.log("Event: " + JSON.stringify(event));
    console.log("Context: " + JSON.stringify(context));
}