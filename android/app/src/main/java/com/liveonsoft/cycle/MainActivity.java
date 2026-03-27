package com.liveonsoft.cycle;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Keep keyboard from resizing WebView so banner stays anchored at screen bottom.
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN);
    }

    @Override
    public void onPostCreate(Bundle savedInstanceState) {
        super.onPostCreate(savedInstanceState);
        applySystemBarPaddingToContent();
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBarPaddingToContent();
    }

    /**
     * Samsung 등 일부 기기에서 setDecorFitsSystemWindows(true)만으로는 WebView가 내비 바 뒤로 그려진다.
     * decor를 맞추지 않고 루트 content에 systemBars(+컷아웃) 패딩을 직접 적용한다.
     */
    private void applySystemBarPaddingToContent() {
        final View content = findViewById(android.R.id.content);
        if (content == null) {
            return;
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
    }
}
