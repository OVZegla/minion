import Image from '@tiptap/extension-image'
import { assetUrl } from '../../db/assets'

/**
 * Image stockée dans la base locale (assetId) plutôt qu'en URL éphémère.
 * Les images web classiques (src) restent prises en charge.
 */
export const AssetImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-asset-id'),
        renderHTML: (attrs) => (attrs.assetId ? { 'data-asset-id': attrs.assetId } : {}),
      },
    }
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('img')
      dom.className = 'rich-img'
      dom.draggable = true
      const apply = (n: typeof node) => {
        if (n.attrs.assetId) {
          assetUrl(n.attrs.assetId).then((u) => {
            if (u) dom.src = u
          })
        } else if (n.attrs.src) dom.src = n.attrs.src
        dom.alt = n.attrs.alt ?? ''
      }
      apply(node)
      return {
        dom,
        update: (n) => {
          if (n.type.name !== 'image') return false
          apply(n)
          return true
        },
      }
    }
  },
})
