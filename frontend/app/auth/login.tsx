import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import KeyboardAwareScreenScrollView from '../../components/KeyboardAwareScreenScrollView';
import { BrandMark, Button, Notice, TextField } from '../../components/ui';
import { colors, fonts, spacing, typography } from '../../constants/theme';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const { login } = useAuth();
  const router = useRouter();

  const canSubmit = username.trim().length > 0 && password.length > 0;

  const handleLogin = async () => {
    if (!canSubmit) {
      setError('Enter your username and password.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await login(username.trim(), password);
      router.replace('/(tabs)/home');
    } catch (e: any) {
      setError(e?.message || 'Could not sign in. Check your details and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScreenScrollView contentContainerStyle={styles.scrollContent}>
        <BrandMark />

        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Welcome back
          </Text>
          <Text style={styles.subtitle}>
            Sign in to see today’s steps, your health risk score and your saved prescriptions.
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="Username"
            icon="person-outline"
            placeholder="Your username"
            value={username}
            onChangeText={(t) => {
              setUsername(t);
              if (error) setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            submitBehavior="submit"
            editable={!isLoading}
          />
          <TextField
            ref={passwordRef}
            label="Password"
            icon="lock-closed-outline"
            placeholder="Your password"
            password
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (error) setError(null);
            }}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            editable={!isLoading}
          />

          {error ? <Notice>{error}</Notice> : null}

          <Button label="Sign in" onPress={handleLogin} loading={isLoading} style={styles.submit} />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>New to Eunoia?</Text>
          <Pressable
            onPress={() => router.push('/auth/register')}
            disabled={isLoading}
            hitSlop={12}
            accessibilityRole="link"
          >
            <Text style={styles.switchLink}>Create an account</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreenScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginTop: 56,
    marginBottom: spacing.xxxl,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    maxWidth: 340,
  },
  form: {
    gap: spacing.xl,
  },
  submit: {
    marginTop: spacing.xs,
  },
  switchRow: {
    marginTop: 'auto',
    paddingTop: spacing.xxxl,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  switchText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  switchLink: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    textDecorationLine: 'underline',
  },
});
