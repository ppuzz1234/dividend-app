import { CubeLoader } from "../components/ui/CubeLoader.jsx";
import styles from "./Simulating.module.css";

/* 로딩 — 브랜드 마크가 3D 큐브로 조립되는 대기 화면.
 * "최종 진행하기" 직후(자산 탭 진입 전)와 구글 인증 복귀 대기에 사용된다. */
const MSGS = ["매수 주문 접수 중", "계좌별 배분 실행 중", "포트폴리오 구성 중"];

export function Simulating() {
  return (
    <div className={styles.wrap}>
      <div className={styles.center}>
        <CubeLoader size={120} msgs={MSGS} />
      </div>
    </div>
  );
}
