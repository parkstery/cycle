package com.liveonsoft.cycle;

import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBarInsets();
        // Keep keyboard from resizing WebView so banner stays anchored at screen bottom.
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN);
    }

    @Override
    public void onPostCreate(Bundle savedInstanceState) {
        super.onPostCreate(savedInstanceState);
        applySystemBarInsets();
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBarInsets();
    }

    /** WebView·맵이 시스템 내비게이션 바 뒤로 그려지지 않도록 인셋 적용을 유지한다. */
    private void applySystemBarInsets() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }
}
