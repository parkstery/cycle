package com.liveonsoft.cycle;

import android.content.res.Configuration;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivityAd";
    private static final String ADMOB_BANNER_AD_UNIT_ID_RELEASE = "ca-app-pub-2386721030013396/2486360510";

    @Nullable
    private FrameLayout nativeAdContainer;
    @Nullable
    private AdView nativeBannerView;
    @Nullable
    private View insetsTargetView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN);
        applySystemBarsForOrientation();
        nativeAdContainer = findViewById(R.id.native_ad_container);
        MobileAds.initialize(this, initializationStatus -> {});
        Log.i(TAG, "onCreate: nativeAdContainer=" + (nativeAdContainer != null));
        initNativeBanner();
        applyRootInsets();
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBarsForOrientation();
        if (nativeBannerView != null) {
            nativeBannerView.resume();
        }
        applyRootInsets();
    }

    @Override
    public void onPause() {
        if (nativeBannerView != null) {
            nativeBannerView.pause();
        }
        super.onPause();
    }

    @Override
    public void onDestroy() {
        destroyNativeBanner();
        super.onDestroy();
    }

    private void applySystemBarsForOrientation() {
        try {
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (controller == null) {
                return;
            }
            boolean isLandscape =
                getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
            if (isLandscape) {
                controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsetsCompat.Type.navigationBars());
            } else {
                controller.show(WindowInsetsCompat.Type.navigationBars());
            }
        } catch (Throwable ignored) {
        }
    }

    private void applyRootInsets() {
        View target = resolveInsetsTargetView();
        if (target == null) {
            return;
        }
        insetsTargetView = target;
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        ViewCompat.setOnApplyWindowInsetsListener(target, (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            boolean isLandscape =
                getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
            int bottomInset = isLandscape ? 0 : insets.bottom;
            v.setPadding(insets.left, insets.top, insets.right, 0);
            applyAdContainerBottomInset(bottomInset);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(target);
    }

    private void applyAdContainerBottomInset(int bottomInsetPx) {
        if (nativeAdContainer == null) {
            return;
        }
        nativeAdContainer.setPadding(0, 0, 0, Math.max(0, bottomInsetPx));
    }

    @Nullable
    private View resolveInsetsTargetView() {
        View content = findViewById(android.R.id.content);
        if (content instanceof ViewGroup vg && vg.getChildCount() > 0) {
            return vg.getChildAt(0);
        }
        return content;
    }

    /**
     * 배너는 onCreate에서만 생성·로드한다. onResume에서는 resume()만 호출한다.
     */
    private void initNativeBanner() {
        if (nativeAdContainer == null) {
            Log.w(TAG, "initNativeBanner: nativeAdContainer is null");
            return;
        }
        nativeAdContainer.post(() -> {
            if (nativeAdContainer == null) {
                return;
            }
            int widthPx = nativeAdContainer.getWidth();
            if (widthPx <= 0) {
                Log.w(TAG, "initNativeBanner: container width is 0, skipping ad load");
                return;
            }
            float density = getResources().getDisplayMetrics().density;
            int widthDp = Math.max(1, (int) (widthPx / density));
            Log.i(
                TAG,
                "initNativeBanner: widthPx=" + widthPx + ", widthDp=" + widthDp
                    + ", orientation=" + getOrientationLabel()
            );

            destroyNativeBanner();

            nativeBannerView = new AdView(this);
            nativeBannerView.setAdUnitId(ADMOB_BANNER_AD_UNIT_ID_RELEASE);
            nativeBannerView.setAdSize(
                AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, widthDp)
            );
            nativeBannerView.setAdListener(new AdListener() {
                @Override
                public void onAdLoaded() {
                    Log.i(TAG, "banner onAdLoaded");
                    if (nativeAdContainer != null) {
                        nativeAdContainer.setVisibility(View.VISIBLE);
                    }
                }

                @Override
                public void onAdFailedToLoad(LoadAdError adError) {
                    Log.e(TAG, "banner onAdFailedToLoad: code=" + adError.getCode() + ", msg=" + adError.getMessage());
                    if (nativeAdContainer != null) {
                        nativeAdContainer.removeAllViews();
                        nativeAdContainer.setVisibility(View.GONE);
                    }
                    if (nativeBannerView != null) {
                        nativeBannerView.destroy();
                        nativeBannerView = null;
                    }
                }
            });
            nativeAdContainer.removeAllViews();
            nativeAdContainer.addView(
                nativeBannerView,
                new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                )
            );
            nativeAdContainer.setVisibility(View.VISIBLE);
            nativeBannerView.loadAd(new AdRequest.Builder().build());
        });
    }

    private void destroyNativeBanner() {
        if (nativeAdContainer != null) {
            nativeAdContainer.removeAllViews();
            nativeAdContainer.setVisibility(View.GONE);
        }
        if (nativeBannerView != null) {
            nativeBannerView.destroy();
            nativeBannerView = null;
        }
    }

    private String getOrientationLabel() {
        int orientation = getResources().getConfiguration().orientation;
        if (orientation == Configuration.ORIENTATION_LANDSCAPE) {
            return "landscape";
        }
        if (orientation == Configuration.ORIENTATION_PORTRAIT) {
            return "portrait";
        }
        return "undefined";
    }
}
