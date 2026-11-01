import fs from "fs";
import { execSync } from "child_process";

const ENV_FILE = ".env.local";

function getWindowsHostIP(): string {
  const route = execSync("ip route show default", { encoding: "utf-8" });
  const match = route.match(/default via ([\d.]+)/);
  if (!match) {
    throw new Error("No default gateway found in 'ip route show default'");
  }
  return match[1];
}

function updateEnvFile(ip: string) {
  let content = fs.readFileSync(ENV_FILE, "utf-8");

  const newLine = `DB_CONNECT_STRING="${ip}:1521/XE"`;

  if (content.includes("DB_CONNECT_STRING=")) {
    content = content.replace(/DB_CONNECT_STRING=.*/g, newLine);
  } else {
    content += `\n${newLine}\n`;
  }

  fs.writeFileSync(ENV_FILE, content);
  console.log(`Updated ${ENV_FILE} with host IP: ${ip}`);
}

const ip = getWindowsHostIP();
updateEnvFile(ip);