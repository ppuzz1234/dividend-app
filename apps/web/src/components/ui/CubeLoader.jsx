import { useEffect, useState } from "react";
import { cx } from "../../lib/cx.js";
import styles from "./CubeLoader.module.css";

/* 루빅스 큐브 로더 — 3x3x3 큐브가 층(layer)별로 비틀린 채 모여들어
 * 차례로 맞춰지고, 마지막에 큐브 전체가 정면으로 돌아서면
 * 앞면이 브랜드 마크(노랑 C + 외곽선 카운터 타일)로 멈추는 루프.
 *
 * 구조: cubeWrap(큐브 전체 회전) > layer 3개(가로 층 비틀림)
 *      > cubie 26개(고정 배치) > face 6개(스티커).
 * 층 비틀림이 모두 세로축(Y) 회전이라 재부모화 없이 CSS만으로 동작한다.
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

export function CubeLoader({ msgs = [], size = 96 }) {
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
    <div className={styles.wrap} role="status" aria-label="불러오는 중">
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
                      className={styles.cubie}
                      style={{ transform: `translate3d(calc(${x} * var(--u)), 0, calc(${z} * var(--u)))` }}
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
