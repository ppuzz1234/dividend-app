import { useEffect, useState } from "react";
import { cx } from "../../lib/cx.js";
import styles from "./CubeLoader.module.css";

/* 루빅스 큐브 로더 — 3x3x3 큐브가 가로 층(layer)별로 비틀린 채 모여들어
 * 차례로 맞춰지고, 정렬이 끝난 정육면체에서 세로 열(column)들이 좌→중→우
 * 순서로 360° 세로 롤을 돈 뒤, 큐브 전체가 정면으로 돌아서면 앞면이
 * 브랜드 마크(노랑 C + 외곽선 카운터 타일)로 멈추는 루프.
 *
 * 구조: cubeWrap(큐브 전체 회전) > layer 3개(가로 층 비틀림 rotateY)
 *      > cubie 26개(세로 열 롤 rotateX — 큐브 중심 축 보정) > face 6개(스티커).
 * 열은 3개 층에 걸쳐 있어 래퍼 회전이 불가하므로, 큐비 키프레임에서
 * translateY(-층오프셋) → rotateX → translateY(층오프셋) 합성으로
 * 회전축을 큐브 중심에 맞춘다(재부모화 없이 CSS만으로 동작).
 * 열 롤은 층이 전부 정착한 뒤에만 돌아 정육면체가 유지되고, 정확히
 * 360°(identity)라 스티커('완성 상태' 기준으로 미리 칠해짐) 정합이 깨지지
 * 않는다 — 마지막 씬은 항상 브랜드 아이콘이 된다.
 * 주의: opacity 는 3D 조상에서 애니메이션하면 컨텍스트가 평면화되므로
 * 등장·퇴장은 전부 transform(스케일·회전)으로만 처리한다.
 *
 * msgs 로 진행 문구 순환, size 로 마크 크기 (기존 인터페이스 유지). */

/* 앞면 로고 매핑 — C 획(솔리드) 좌표 "row,col" (0,0 = 좌상단) */
const C_SOLID = new Set(["0,0", "0,1", "0,2", "1,0", "2,0", "2,1", "2,2"]);

/* 큐비(x,y,z ∈ -1..1, y=-1 이 윗층)가 바깥으로 드러내는 스티커 색 */
function stickersFor(x, y, z) {
  const s = {};
  if (y === -1) s.top = "gold";
  if (y === 1) s.bottom = "white";
  if (x === -1) s.left = "red";
  if (x === 1) s.right = "green";
  if (z === -1) s.back = "blue";
  if (z === 1) s.front = C_SOLID.has(`${y + 1},${x + 1}`) ? "gold" : "counter";
  return s;
}

const FACES = ["front", "back", "top", "bottom", "left", "right"];
const FACE_CLASS = {
  front: "fFront",
  back: "fBack",
  top: "fTop",
  bottom: "fBottom",
  left: "fLeft",
  right: "fRight",
};
const STICKER_CLASS = {
  gold: "stGold",
  red: "stRed",
  green: "stGreen",
  blue: "stBlue",
  white: "stWhite",
  counter: "stCounter",
};

const LAYER_CLASS = ["layerTop", "layerMid", "layerBot"]; // y = -1, 0, 1
const COL_CLASS = { "-1": "colL", 0: "colM", 1: "colR" }; // x = -1, 0, 1 — 세로 열 비틀림

export function CubeLoader({ msgs = [], size = 96, bare = false }) {
  const [msg, setMsg] = useState(0);

  useEffect(() => {
    if (msgs.length < 2) return;
    const t = setInterval(() => setMsg((v) => (v + 1) % msgs.length), 900);
    return () => clearInterval(t);
  }, [msgs.length]);

  const stageVars = {
    width: size,
    height: size,
    perspective: `${size * 8}px`,
    "--s": `${size * 0.3}px`, // 큐비 한 변
    "--u": `${size * 0.32}px`, // 큐비 간격(피치)
  };

  return (
    <div className={cx(styles.wrap, bare && styles.bare)} role="status" aria-label="불러오는 중">
      <div className={styles.stage} style={stageVars}>
        <div className={styles.glow} />
        <div className={styles.cube}>
          {[-1, 0, 1].map((y, yi) => (
            <div key={y} className={cx(styles.layer, styles[LAYER_CLASS[yi]])}>
              {[-1, 0, 1].flatMap((z) =>
                [-1, 0, 1].map((x) => {
                  if (x === 0 && y === 0 && z === 0) return null; // 내부 큐비는 보이지 않음
                  const st = stickersFor(x, y, z);
                  return (
                    <div
                      key={`${x},${z}`}
                      className={cx(styles.cubie, styles[COL_CLASS[x]])}
                      style={{ "--cx": x, "--cz": z }}
                    >
                      {FACES.map((f) => (
                        <i
                          key={f}
                          className={cx(
                            styles.face,
                            styles[FACE_CLASS[f]],
                            st[f] && styles[STICKER_CLASS[st[f]]]
                          )}
                        />
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>
      {msgs.length > 0 && <div className={styles.msg}>{msgs[msg % msgs.length]}</div>}
    </div>
  );
}
