package com.liveonsoft.cycle;

import android.content.res.Configuration;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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

/**
 * 시스템 내비·상태바·노치 영역까지 WebView 콘텐츠가 그려지지 않도록 인셋을 적용한다.
 * 부모에는 left/top/right만 패딩(가로 모드 오른쪽 내비 회피). bottom은 부모에 두지 않는다.
 * 부모 bottom 패딩과 AdMob 배너의 bottom margin이 겹치면 세로 모드에서 배너 아래 빈 줄이 생긴다.
 * bottom 인셋은 WebView에만 패딩으로 적용한다. WebView에 좌·상·우까지 모두 주면 세로에서
 * 오른쪽 띠 등 레이아웃 이상이 날 수 있어 좌·상·우는 부모가 담당한다.
 * SOFT_INPUT_ADJUST_PAN 유지 → 키보드/배너 관련 기존 동작 보존.
 */
public class MainActivity extends BridgeActivity {

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
    public void onDestroy() {
        mainHandler.removeCallbacks(applyInsetsRunnable);
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
     * AdMob 등 플러그인이 WebView와 형제로 추가한 뷰가 드로잉 순서상 뒤로 가면
     * 가로 모드에서 배너가 WebView 하단 콘텐츠에 가려질 수 있다.
     * WebView가 아닌 마지막 형제를 앞으로 올려 배너·오버레이가 위에 오도록 한다.
     */
    private void scheduleBringNonWebContentAboveWebView() {
        mainHandler.postDelayed(this::bringNonWebContentAboveWebViewOnce, 280);
        mainHandler.postDelayed(this::bringNonWebContentAboveWebViewOnce, 900);
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
            View parent = (View) wv.getParent();
            if (!(parent instanceof ViewGroup)) {
                return;
            }
            ViewGroup vg = (ViewGroup) parent;
            int n = vg.getChildCount();
            if (n < 2) {
                return;
            }
            View last = vg.getChildAt(n - 1);
            if (last != null && last != wv) {
                vg.bringChildToFront(last);
            }
        } catch (Throwable ignored) {
        }
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
