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
 * 시스템 내비·상태바 영역까지 WebView 콘텐츠가 그려지지 않도록 인셋을 적용한다.
 * Capacitor는 content 아래 자식에 WebView를 붙이므로, 가능하면 WebView의 부모에 패딩을 준다.
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
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        scheduleApplySystemBarInsets();
    }

    @Override
    protected void onDestroy() {
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
            v.setPadding(insets.left, insets.top, insets.right, insets.bottom);
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
