import React from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

type KeyboardAwareScreenScrollViewProps = React.ComponentProps<
  typeof KeyboardAwareScrollView
>;

export default function KeyboardAwareScreenScrollView({
  children,
  enableAutomaticScroll = true,
  enableOnAndroid = true,
  extraHeight = 24,
  extraScrollHeight = 16,
  keyboardShouldPersistTaps = 'handled',
  showsVerticalScrollIndicator = false,
  ...props
}: KeyboardAwareScreenScrollViewProps) {
  return (
    <KeyboardAwareScrollView
      enableAutomaticScroll={enableAutomaticScroll}
      enableOnAndroid={enableOnAndroid}
      extraHeight={extraHeight}
      extraScrollHeight={extraScrollHeight}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
