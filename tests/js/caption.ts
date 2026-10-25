import { act, screen, waitFor } from '@testing-library/react'
import { expect } from 'vitest'
import type { LexicalEditor } from 'lexical'
import { $fromStored, $toStored } from '../../frontend/admin/components/caption/serialize'

type EditorElement = HTMLElement & { __lexicalEditor?: LexicalEditor }

/**
 * The caption editor with a name, after its library loads. jsdom has no text input for a
 * contenteditable field, so the tests read and set the value through the editor.
 */
export async function findCaption(name: string | RegExp = 'Caption'): Promise<EditorElement> {
  // The editor library loads on demand, which takes longer while all test files run at once.
  const el = (await screen.findByRole('textbox', { name }, { timeout: 4000 })) as EditorElement
  await waitFor(() => expect(el.__lexicalEditor).toBeTruthy(), { timeout: 4000 })
  return el
}

/** The value of a caption editor: the template text, with each chip as its token. */
export function captionValue(el: EditorElement): string {
  return el.__lexicalEditor!.getEditorState().read($toStored)
}

/** Sets the text of a caption editor as if the user typed it: known tokens become chips. */
export async function typeCaption(el: EditorElement, text: string): Promise<void> {
  await act(async () => {
    el.__lexicalEditor!.update(() => $fromStored(text, 'text'), { discrete: true })
  })
}
