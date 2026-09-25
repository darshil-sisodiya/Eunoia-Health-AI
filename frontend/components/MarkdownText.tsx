import React from 'react';
import Markdown, { MarkdownProps } from 'react-native-markdown-display';
import { colors, fonts } from '../constants/theme';

type MarkdownVariant = 'light' | 'dark';

// AI text (chat replies, reports, prescription advice). Onest for reading,
// Young Serif for headings. Weight comes from the font family, never
// fontWeight, because each weight is its own registered font.
const baseStyles: MarkdownProps['style'] = {
  body: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  strong: {
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  em: {
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 10,
  },
  heading1: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    marginTop: 8,
    marginBottom: 10,
    color: colors.textPrimary,
  },
  heading2: {
    fontFamily: fonts.display,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.2,
    marginTop: 8,
    marginBottom: 8,
    color: colors.textPrimary,
  },
  heading3: {
    fontFamily: fonts.display,
    fontSize: 17,
    lineHeight: 23,
    marginTop: 4,
    marginBottom: 6,
    color: colors.textPrimary,
  },
  bullet_list: {
    marginTop: 0,
    marginBottom: 12,
  },
  ordered_list: {
    marginTop: 0,
    marginBottom: 12,
  },
  list_item: {
    marginVertical: 4,
    flexDirection: 'row',
  },
  bullet_list_icon: {
    color: colors.textTertiary,
    marginLeft: 4,
    marginRight: 10,
  },
  ordered_list_icon: {
    fontFamily: fonts.medium,
    color: colors.textTertiary,
    marginLeft: 4,
    marginRight: 10,
  },
  code_inline: {
    fontFamily: fonts.regular,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  code_block: {
    fontFamily: fonts.regular,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    padding: 12,
    borderRadius: 12,
    borderWidth: 0,
    marginBottom: 12,
  },
  fence: {
    fontFamily: fonts.regular,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    padding: 12,
    borderRadius: 12,
    borderWidth: 0,
    marginBottom: 12,
  },
  blockquote: {
    backgroundColor: colors.background,
    borderLeftWidth: 3,
    borderLeftColor: colors.surfaceBorderStrong,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    marginLeft: 0,
  },
  link: {
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    textDecorationLine: 'underline',
  },
  hr: {
    backgroundColor: colors.divider,
    height: 1,
    marginVertical: 12,
  },
};

const variants: Record<MarkdownVariant, MarkdownProps['style']> = {
  light: {},
  dark: {
    body: { color: colors.textInverse },
    strong: { color: colors.textInverse },
    em: { color: colors.textInverseMuted },
    heading1: { color: colors.textInverse },
    heading2: { color: colors.textInverse },
    heading3: { color: colors.textInverse },
    code_inline: { backgroundColor: 'rgba(255, 255, 255, 0.10)', color: colors.textInverse },
    code_block: { backgroundColor: 'rgba(255, 255, 255, 0.08)', color: colors.textInverse },
    fence: { backgroundColor: 'rgba(255, 255, 255, 0.08)', color: colors.textInverse },
    blockquote: { backgroundColor: 'rgba(255, 255, 255, 0.08)', borderLeftColor: colors.inkBorderStrong },
    bullet_list_icon: { color: colors.textInverseMuted },
    ordered_list_icon: { color: colors.textInverseMuted },
    link: { color: colors.textInverse },
    hr: { backgroundColor: colors.inkBorderStrong },
  },
};

const composeStyles = (
  variant: MarkdownVariant,
  overrides?: MarkdownProps['style']
): MarkdownProps['style'] => {
  const combined: MarkdownProps['style'] = {};

  Object.keys(baseStyles).forEach((key) => {
    const styleKey = key as keyof MarkdownProps['style'];
    combined[styleKey] = {
      ...(baseStyles[styleKey] || {}),
      ...(variants[variant]?.[styleKey] || {}),
    } as any;
  });

  if (overrides) {
    Object.keys(overrides).forEach((key) => {
      const styleKey = key as keyof MarkdownProps['style'];
      combined[styleKey] = {
        ...(combined[styleKey] || {}),
        ...(overrides[styleKey] || {}),
      } as any;
    });
  }

  return combined;
};

interface MarkdownTextProps {
  content?: string | null;
  variant?: MarkdownVariant;
  styleOverrides?: MarkdownProps['style'];
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({ content, variant = 'light', styleOverrides }) => {
  if (!content) {
    return null;
  }

  return <Markdown style={composeStyles(variant, styleOverrides)}>{content}</Markdown>;
};
