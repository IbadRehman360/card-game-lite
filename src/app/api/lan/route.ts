import { networkInterfaces } from "node:os";
import { type NextRequest, connection } from "next/server";

/** The addresses other devices on the same Wi-Fi can use to reach this server. */
export async function GET(req: NextRequest) {
  await connection(); // per request: addresses and port belong to the running server, not the build machine
  const port = req.nextUrl.port || (req.nextUrl.protocol === "https:" ? "443" : "80");
  const addresses: string[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    // Skip virtual adapters (WSL, Hyper-V, Docker, VPNs) that friends can't reach.
    if (/vethernet|wsl|docker|virtualbox|vmware|hyper-v|loopback|tailscale|zerotier/i.test(name)) continue;
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) addresses.push(a.address);
    }
  }
  return Response.json({ urls: addresses.map((ip) => `http://${ip}:${port}`) });
}
