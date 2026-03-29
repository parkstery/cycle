package com.liveonsoft.cycle;

import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.annotation.Nullable;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

/**
 * 시스템 내비·상태바·노치 영역까지 WebView 콘텐츠가 그려지지 않도록 인셋을 적용한다.
 * 부모에는 left/top/right만 패딩(가로 모드 오른쪽 내비 회피). bottom은 부모에 두지 않는다.
 * 부모 bottom 패딩과 AdMob 배너의 bottom margin이 겹치면 세로 모드에서 배너 아래 빈 줄이 생긴다.
 * bottom 인셋은 WebView에만 패딩으로 적용한다. WebView에 좌·상·우까지 모두 주면 세로에서
 * 오른쪽 띠 등 레이아웃 이상이 날 수 있어 좌·상·우는 부모가 담당한다.
 * SOFT_INPUT_ADJUST_PAN 유지 → 키보드/배너 관련 기존 동작 보존.
 */
public class MainActivity extends BridgeActivity {

    /**
     * 배너 끄기 테스트 1-B: true면 WebView 형제 중 AdView를 포함한 뷰를 부모에서 제거(계층에서 제거).
     * App.tsx의 DEBUG_DISABLE_BANNER_AD로 show를 막은 뒤에도 잔류하면 true로 A/B 판정.
     * 기본 false — 출시·일상 빌드는 변경하지 말 것.
     */
    private static final boolean DEBUG_REMOVE_BANNER_AD_VIEW_FROM_HIERARCHY = false;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable applyInsetsRunnable = this::applySystemBarInsetsOnce;

    @Nullable
    private View insetTargetAttached;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN);
        scheduleApplySystemBarInsets();
    }

    @Override
    public void onPostCreate(Bundle savedInstanceState) {
        super.onPostCreate(savedInstanceState);
        scheduleApplySystemBarInsets();
    }

    @Override
    public void onResume() {
        super.onResume();
        scheduleApplySystemBarInsets();
        scheduleBringNonWebContentAboveWebView();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        scheduleApplySystemBarInsets();
        scheduleBringNonWebContentAboveWebView();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            scheduleBringNonWebContentAboveWebView();
        }
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacks(applyInsetsRunnable);
        mainHandler.removeCallbacks(this::bringNonWebContentAboveWebViewOnce);
        super.onDestroy();
    }

    private void scheduleApplySystemBarInsets() {
        mainHandler.removeCallbacks(applyInsetsRunnable);
        final View decor = getWindow().getDecorView();
        decor.post(applyInsetsRunnable);
        mainHandler.postDelayed(applyInsetsRunnable, 120);
        mainHandler.postDelayed(applyInsetsRunnable, 380);
    }

    /**
     * 네이티브 스택(아래→위): WebView(인덱스 0) → 플러그인 뷰 → AdMob(최상단).
     * 하단 전폭 흰 백드롭 뷰는 배너 위 흰/반투명 띠로 보일 수 있어 두지 않음.
     * WebView 배경은 9a3edb1과 동일하게 검정(투명·슬레이트와 네이티브 배너 합성 시 흰 반투명 번짐 완화).
     * PM 흰색 요청 시 가로 좌우 띠 이슈와 트레이드오프 — 본 이슈 우선 시 BLACK 유지.
     */
    private void scheduleBringNonWebContentAboveWebView() {
        mainHandler.removeCallbacks(this::bringNonWebContentAboveWebViewOnce);
        mainHandler.post(this::bringNonWebContentAboveWebViewOnce);
        mainHandler.postDelayed(this::bringNonWebContentAboveWebViewOnce, 80);
        mainHandler.postDelayed(this::bringNonWebContentAboveWebViewOnce, 280);
        mainHandler.postDelayed(this::bringNonWebContentAboveWebViewOnce, 900);
        mainHandler.postDelayed(this::bringNonWebContentAboveWebViewOnce, 2000);
    }

    private void bringNonWebContentAboveWebViewOnce() {
        try {
            Bridge bridge = getBridge();
            if (bridge == null) {
                return;
            }
            WebView wv = bridge.getWebView();
            if (wv == null) {
                return;
            }
            wv.setBackgroundColor(Color.BLACK);
            wv.setElevation(0f);
            wv.setTranslationZ(0f);

            View parent = (View) wv.getParent();
            if (!(parent instanceof ViewGroup)) {
                return;
            }
            ViewGroup vg = (ViewGroup) parent;

            int idx = vg.indexOfChild(wv);
            if (idx > 0) {
                vg.removeView(wv);
                vg.addView(wv, 0);
            }

            if (DEBUG_REMOVE_BANNER_AD_VIEW_FROM_HIERARCHY) {
                removeBannerAdHostViews(vg, wv);
            }
            stackNativeLayersBannerOnTop(vg, wv);
            vg.requestLayout();
            wv.invalidate();
        } catch (Throwable ignored) {
        }
    }

    /** AdView(또는 그 서브트리)를 담은 직계 자식만 제거. WebView는 유지. */
    private static void removeBannerAdHostViews(ViewGroup vg, WebView wv) {
        for (int i = vg.getChildCount() - 1; i >= 0; i--) {
            View c = vg.getChildAt(i);
            if (c != wv && viewSubtreeContainsAdMobAdView(c)) {
                vg.removeView(c);
            }
        }
    }

    /**
     * AdMob AdView를 포함한 형제 레이아웃은 elevation·draw 순서 모두 최상단으로.
     * 그 외 플러그인 뷰는 WebView 위·배너 아래.
     */
    private void stackNativeLayersBannerOnTop(ViewGroup vg, WebView wv) {
        float density = getResources().getDisplayMetrics().density;
        float midZ = Math.max(16f, 12f * density);
        float adZ = Math.max(32f, 24f * density);

        wv.setElevation(0f);
        wv.setTranslationZ(0f);

        List<View> adHosts = new ArrayList<>();
        List<View> otherPlugins = new ArrayList<>();
        for (int i = 0; i < vg.getChildCount(); i++) {
            View c = vg.getChildAt(i);
            if (c == wv) {
                continue;
            }
            if (viewSubtreeContainsAdMobAdView(c)) {
                adHosts.add(c);
            } else {
                otherPlugins.add(c);
            }
        }

        for (View c : otherPlugins) {
            c.setElevation(midZ);
            c.setTranslationZ(0f);
        }
        for (View c : adHosts) {
            c.setElevation(adZ);
            c.setTranslationZ(0f);
        }

        for (View c : otherPlugins) {
            vg.bringChildToFront(c);
        }
        for (View c : adHosts) {
            vg.bringChildToFront(c);
        }

        // API 21+: draw 순서를 elevation 외에 Z로 한 번 더 고정(WebView가 배너 위로 올라가는 기기 대응).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            wv.setZ(0f);
            for (View c : otherPlugins) {
                c.setZ(midZ);
            }
            for (View c : adHosts) {
                c.setZ(Math.max(adZ, 100f));
            }
        }
    }

    /** 문자열 비교로 의존 최소화(Play services Ads 클래스명). */
    private static boolean viewSubtreeContainsAdMobAdView(View v) {
        if (v == null) {
            return false;
        }
        if ("com.google.android.gms.ads.AdView".equals(v.getClass().getName())) {
            return true;
        }
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) {
                if (viewSubtreeContainsAdMobAdView(g.getChildAt(i))) {
                    return true;
                }
            }
        }
        return false;
    }

    private void applySystemBarInsetsOnce() {
        final View target = resolveInsetsTargetView();
        if (target == null) {
            return;
        }
        if (insetTargetAttached != null && insetTargetAttached != target) {
            insetTargetAttached.setPadding(0, 0, 0, 0);
            ViewCompat.setOnApplyWindowInsetsListener(insetTargetAttached, null);
        }
        insetTargetAttached = target;

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        ViewCompat.setOnApplyWindowInsetsListener(target, (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            WebView wv = null;
            try {
                Bridge bridge = getBridge();
                if (bridge != null) {
                    wv = bridge.getWebView();
                }
            } catch (Throwable ignored) {
            }
            if (wv != null) {
                v.setPadding(insets.left, insets.top, insets.right, 0);
                wv.setPadding(0, 0, 0, insets.bottom);
            } else {
                v.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            }
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(getWindow().getDecorView());
    }

    @Nullable
    private View resolveInsetsTargetView() {
        try {
            Bridge bridge = getBridge();
            if (bridge != null) {
                WebView wv = bridge.getWebView();
                if (wv != null) {
                    View parent = (View) wv.getParent();
                    if (parent != null) {
                        return parent;
                    }
                    return wv;
                }
            }
        } catch (Throwable ignored) {
        }
        View content = findViewById(android.R.id.content);
        if (content instanceof ViewGroup) {
            ViewGroup vg = (ViewGroup) content;
            if (vg.getChildCount() > 0) {
                return vg.getChildAt(0);
            }
        }
        return content;
    }
}
