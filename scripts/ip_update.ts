import fs from "fs";

const ENV_FILE = ".env.local";

function getWindowsHostIP(): string {
  const resolvConf = fs.readFileSync("/etc/resolv.conf", "utf-8");
  const match = resolvConf.match(/nameserver\s+([\d.]+)/);
  if (!match) {
    throw new Error("IP not in /etc/resolv.conf");
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