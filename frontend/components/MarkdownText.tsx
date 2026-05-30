import React from 'react';
import Markdown, { MarkdownProps } from 'react-native-markdown-display';
import { Platform } from 'react-native';
import { colors } from '../constants/theme';

type MarkdownVariant = 'light' | 'dark';

const baseStyles: MarkdownProps['style'] = {
  body: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.1,
    color: colors.textPrimary,
  },
  strong: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  em: {
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  paragraph: {
    marginBottom: 8,
  },
  heading1: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 12,
    color: colors.textPrimary,
  },
  heading2: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 10,
    color: colors.textPrimary,
  },
  heading3: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginBottom: 8,
    color: colors.textPrimary,
  },
  bullet_list: {
    marginVertical: 8,
  },
  ordered_list: {
    marginVertical: 8,
  },
  list_item: {
    marginVertical: 4,
    flexDirection: 'row',
  },
  bullet_list_icon: {
    color: colors.textTertiary,
  },
  ordered_list_icon: {
    color: colors.textTertiary,
  },
  code_inline: {
    backgroundColor: colors.backgroundTertiary,
    color: colors.textPrimary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  code_block: {
    backgroundColor: colors.backgroundSecondary,
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  fence: {
    backgroundColor: colors.backgroundSecondary,
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  link: {
    color: colors.accent,
    fontWeight: '600',
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
    body: {
      color: colors.textInverse,
    },
    strong: {
      color: colors.textInverse,
    },
    em: {
      color: colors.textInverseMuted,
    },
    heading1: {
      color: colors.textInverse,
    },
    heading2: {
      color: colors.textInverse,
    },
    heading3: {
      color: colors.textInverseMuted,
    },
    code_inline: {
      backgroundColor: 'rgba(255, 255, 255, 0.10)',
      color: colors.textInverse,
    },
    code_block: {
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    fence: {
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    bullet_list_icon: {
      color: colors.textInverseMuted,
    },
    ordered_list_icon: {
      color: colors.textInverseMuted,
    },
    link: {
      color: '#A5B4FC',
    },
    hr: {
      backgroundColor: 'rgba(255, 255, 255, 0.12)',
    },
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
