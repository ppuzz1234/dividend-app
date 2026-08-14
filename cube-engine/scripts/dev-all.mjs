/**
 * 프런트와 세법 엔진을 **한 명령으로** 같이 띄운다.
 *
 * 왜: 엔진은 별도 프로세스라 터미널 두 개를 요구했는데, 받아서 처음 돌리는 사람에게
 * "저쪽 터미널에서 이것도 켜세요" 는 그냥 안 켜진다는 뜻이다. 버튼은 보이는데 물으면
 * 실패하고, 원인이 '엔진이 안 떠서' 라는 걸 알 방법이 없다.
 *
 * 의존성을 새로 넣지 않으려고 child_process 만 쓴다. 한쪽이 죽으면 같이 내린다 —
 * 반쪽만 살아 있으면 위와 똑같은 상황이 되기 때문이다.
 *
 * ponytail: 색인이 없으면 엔진이 부팅에 실패한다. 여기서 색인을 대신 만들어 주지는
 * 않는다(수 분 + 임베딩 API 비용이라 사람이 알고 시작해야 한다). 대신 어떤 명령을
 * 쳐야 하는지 알려주고 끝낸다.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const engineDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(engineDir);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (!existsSync(join(engineDir, "node_modules"))) {
  console.error("\n[cube] 엔진 의존성이 없습니다. 먼저:\n  cd cube-engine && npm install\n");
  process.exit(1);
}
if (!existsSync(join(engineDir, "packages/factindex/index"))) {
  console.error(
    "\n[cube] 법령 색인이 없습니다. 한 번만 만들면 됩니다(수 분 · 임베딩 API 사용):\n" +
      "  cd cube-engine && npm run build:index -w @cube/factindex\n" +
      "  (cube-engine/.env 의 LLM_API_KEY 가 채워져 있어야 합니다)\n",
  );
  process.exit(1);
}

const kids = [
  { name: "engine", cwd: engineDir, args: ["run", "serve", "-w", "@cube/factui"] },
  { name: "web", cwd: repoRoot, args: ["run", "dev", "--workspace", "apps/web"] },
].map(({ name, cwd, args }) => {
  const p = spawn(npm, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  p.on("exit", (code) => {
    console.error(`\n[cube] ${name} 종료 (code ${String(code)}) — 나머지도 내립니다.`);
    stopAll();
    process.exit(code ?? 1);
  });
  return p;
});

function stopAll() {
  for (const p of kids) {
    if (p.exitCode === null) p.kill();
  }
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopAll();
    process.exit(0);
  });
}

console.log("\n[cube] 엔진 + 프런트를 함께 띄웁니다. 엔진은 색인 적재에 수십 초 걸립니다.\n");
