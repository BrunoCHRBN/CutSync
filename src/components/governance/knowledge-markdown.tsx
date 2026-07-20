import React, { useMemo, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import MarkdownIt from 'markdown-it';
import type { KnowledgeAttachment } from '../../types/governance-knowledge';
import { colors, radii, typography } from '../../theme/tokens';

type MarkdownToken = ReturnType<MarkdownIt['parse']>[number];

const parser = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: false,
});
parser.disable(['image']);
parser.validateLink = (url) => /^https?:\/\//i.test(url);

const attachmentPattern = /^\s*!\[([^\]]{3,240})\]\(kb-attachment:([0-9a-f-]{36})\)\s*$/i;

interface KnowledgeMarkdownProps {
  markdown: string;
  attachments?: KnowledgeAttachment[];
  testID: string;
  showUnreferencedAttachments?: boolean;
}

type Segment = { type: 'markdown'; value: string } | { type: 'attachment'; id: string; alt: string };

function splitMarkdown(markdown: string): Segment[] {
  const segments: Segment[] = [];
  let markdownBuffer: string[] = [];
  const flush = () => {
    const value = markdownBuffer.join('\n').trim();
    if (value) segments.push({ type: 'markdown', value });
    markdownBuffer = [];
  };
  markdown.split(/\r?\n/).forEach((line) => {
    const match = line.match(attachmentPattern);
    if (match) {
      flush();
      segments.push({ type: 'attachment', alt: match[1], id: match[2] });
    } else {
      markdownBuffer.push(line);
    }
  });
  flush();
  return segments;
}

export function KnowledgeMarkdown({
  markdown,
  attachments = [],
  testID,
  showUnreferencedAttachments = true,
}: KnowledgeMarkdownProps) {
  const [selected, setSelected] = useState<KnowledgeAttachment | null>(null);
  const segments = useMemo(() => splitMarkdown(markdown), [markdown]);
  const attachmentsById = useMemo(() => new Map(attachments.map((item) => [item.id, item])), [attachments]);
  const referencedIds = useMemo(
    () => new Set(segments.filter((segment): segment is Extract<Segment, { type: 'attachment' }> => segment.type === 'attachment').map((segment) => segment.id)),
    [segments],
  );
  const unreferenced = showUnreferencedAttachments
    ? attachments.filter((attachment) => !referencedIds.has(attachment.id))
    : [];

  return (
    <View testID={testID} style={styles.container}>
      {segments.map((segment, index) => {
        if (segment.type === 'attachment') {
          const attachment = attachmentsById.get(segment.id);
          return attachment ? (
            <AttachmentImage key={`${segment.id}-${index}`} attachment={attachment} onOpen={setSelected} />
          ) : (
            <View key={`${segment.id}-${index}`} style={styles.missingAttachment}>
              <Text selectable style={styles.missingText}>Imagem indisponível: {segment.alt}</Text>
            </View>
          );
        }
        return <MarkdownBlocks key={`markdown-${index}`} tokens={parser.parse(segment.value, {})} />;
      })}

      {unreferenced.length > 0 && (
        <View style={styles.gallery}>
          <Text style={styles.galleryTitle}>Imagens anexadas</Text>
          {unreferenced.map((attachment) => (
            <AttachmentImage key={attachment.id} attachment={attachment} onOpen={setSelected} />
          ))}
        </View>
      )}

      <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.lightbox}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar imagem" onPress={() => setSelected(null)} style={styles.closeButton}>
            <X color={colors.white} size={24} />
          </Pressable>
          {!!selected?.signed_url && (
            <Image source={{ uri: selected.signed_url }} style={styles.lightboxImage} contentFit="contain" accessibilityLabel={selected.alt_text} />
          )}
          <Text selectable style={styles.lightboxCaption}>{selected?.alt_text}</Text>
        </View>
      </Modal>
    </View>
  );
}

function AttachmentImage({ attachment, onOpen }: { attachment: KnowledgeAttachment; onOpen: (attachment: KnowledgeAttachment) => void }) {
  const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 16 / 9;
  if (!attachment.signed_url) {
    return (
      <View style={styles.missingAttachment}>
        <Text selectable style={styles.missingText}>Não foi possível autorizar a imagem “{attachment.alt_text}”.</Text>
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={`Ampliar imagem: ${attachment.alt_text}`} onPress={() => onOpen(attachment)} style={styles.imageFrame}>
      <Image
        source={{ uri: attachment.signed_url }}
        style={[styles.image, { aspectRatio: Math.max(0.6, Math.min(ratio, 2.4)) }]}
        contentFit="contain"
        accessibilityLabel={attachment.alt_text}
      />
      <Text selectable style={styles.caption}>{attachment.alt_text}</Text>
    </Pressable>
  );
}

function MarkdownBlocks({ tokens }: { tokens: MarkdownToken[] }) {
  const rows: React.ReactNode[] = [];
  let quoteDepth = 0;
  let listDepth = 0;
  let ordered = false;
  let orderedIndex = 1;
  let currentListMarker: string | null = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'blockquote_open') { quoteDepth += 1; continue; }
    if (token.type === 'blockquote_close') { quoteDepth = Math.max(0, quoteDepth - 1); continue; }
    if (token.type === 'bullet_list_open') { listDepth += 1; ordered = false; continue; }
    if (token.type === 'ordered_list_open') {
      listDepth += 1;
      ordered = true;
      orderedIndex = Number(token.attrGet('start') || 1);
      continue;
    }
    if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      listDepth = Math.max(0, listDepth - 1);
      continue;
    }
    if (token.type === 'list_item_open') {
      currentListMarker = ordered ? `${orderedIndex++}.` : '•';
      continue;
    }
    if (token.type === 'list_item_close') { currentListMarker = null; continue; }

    if (token.type === 'heading_open') {
      const inline = tokens[index + 1];
      const level = Number(token.tag.slice(1));
      rows.push(
        <Text key={`heading-${index}`} selectable style={[styles.heading, level === 1 ? styles.headingOne : level === 2 ? styles.headingTwo : styles.headingThree]}>
          {inline?.type === 'inline' ? renderInline(inline.children ?? [], `heading-${index}`) : null}
        </Text>,
      );
      index += 2;
      continue;
    }

    if (token.type === 'paragraph_open') {
      const inline = tokens[index + 1];
      const content = inline?.type === 'inline' ? renderInline(inline.children ?? [], `paragraph-${index}`) : null;
      rows.push(
        <View key={`paragraph-${index}`} style={[styles.paragraphRow, quoteDepth > 0 && styles.quote, listDepth > 0 && styles.listRow]}>
          {!!currentListMarker && <Text style={styles.listMarker}>{currentListMarker}</Text>}
          <Text selectable style={[styles.paragraph, quoteDepth > 0 && styles.quoteText]}>{content}</Text>
        </View>,
      );
      index += 2;
      continue;
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      rows.push(
        <ScrollView key={`code-${index}`} horizontal style={styles.codeBlock} contentContainerStyle={styles.codeContent}>
          <Text selectable style={styles.codeText}>{token.content.replace(/\n$/, '')}</Text>
        </ScrollView>,
      );
      continue;
    }

    if (token.type === 'hr') rows.push(<View key={`hr-${index}`} style={styles.rule} />);
  }

  return <View style={styles.blocks}>{rows}</View>;
}

function renderInline(tokens: MarkdownToken[], keyPrefix: string): React.ReactNode[] {
  let strong = false;
  let emphasis = false;
  let strike = false;
  let link: string | null = null;
  const output: React.ReactNode[] = [];
  tokens.forEach((token, index) => {
    if (token.type === 'strong_open') { strong = true; return; }
    if (token.type === 'strong_close') { strong = false; return; }
    if (token.type === 'em_open') { emphasis = true; return; }
    if (token.type === 'em_close') { emphasis = false; return; }
    if (token.type === 's_open') { strike = true; return; }
    if (token.type === 's_close') { strike = false; return; }
    if (token.type === 'link_open') { link = token.attrGet('href'); return; }
    if (token.type === 'link_close') { link = null; return; }
    if (token.type === 'softbreak' || token.type === 'hardbreak') { output.push('\n'); return; }
    if (token.type !== 'text' && token.type !== 'code_inline') return;
    const safeLink = link && /^https?:\/\//i.test(link) ? link : null;
    output.push(
      <Text
        key={`${keyPrefix}-${index}`}
        accessibilityRole={safeLink ? 'link' : undefined}
        onPress={safeLink ? () => Linking.openURL(safeLink) : undefined}
        style={[
          strong && styles.strong,
          emphasis && styles.emphasis,
          strike && styles.strike,
          token.type === 'code_inline' && styles.inlineCode,
          safeLink && styles.link,
        ]}
      >
        {token.content}
      </Text>,
    );
  });
  return output;
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  blocks: { gap: 12 },
  heading: { color: colors.text, fontFamily: typography.display },
  headingOne: { fontSize: 24, lineHeight: 31 },
  headingTwo: { fontSize: 19, lineHeight: 26 },
  headingThree: { fontSize: 16, lineHeight: 23 },
  paragraphRow: { flexDirection: 'row', alignItems: 'flex-start' },
  paragraph: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 23 },
  strong: { color: colors.text, fontFamily: typography.bodyStrong },
  emphasis: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  inlineCode: { color: colors.brand, backgroundColor: colors.brandSoft, fontFamily: 'monospace', fontSize: 13 },
  link: { color: colors.info, textDecorationLine: 'underline' },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.brandBorder, paddingLeft: 14 },
  quoteText: { fontStyle: 'italic' },
  listRow: { paddingLeft: 8 },
  listMarker: { width: 28, color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 14, lineHeight: 23 },
  codeBlock: { backgroundColor: '#18201B', borderRadius: radii.md, borderCurve: 'continuous' },
  codeContent: { padding: 16 },
  codeText: { color: '#E8ECE9', fontFamily: 'monospace', fontSize: 12, lineHeight: 19 },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  imageFrame: { width: '100%', borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.canvasSoft },
  image: { width: '100%', maxHeight: 540 },
  caption: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 17, padding: 12 },
  missingAttachment: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.warning, borderRadius: radii.md, padding: 16, backgroundColor: colors.warningSoft },
  missingText: { color: colors.warning, fontFamily: typography.body, fontSize: 12 },
  gallery: { gap: 12, paddingTop: 8 },
  galleryTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 14 },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  closeButton: { position: 'absolute', top: 24, right: 24, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.16)', zIndex: 2 },
  lightboxImage: { width: '100%', height: '82%' },
  lightboxCaption: { color: colors.white, fontFamily: typography.body, fontSize: 13, textAlign: 'center' },
});
