// This helper runs completely inside the browser to scrape text layout items from a PDF file wrapper
export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  
  const pdfjsLib = (window as any)['pdfjs-dist/build/pdf']
  if (!pdfjsLib) {
    throw new Error('PDF engine not initialised')
  }

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  let fullText = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    
    // Concatenate individual text string elements captured from the viewport layer
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      
    fullText += pageText + '\n'
  }

  return fullText
}

// Global window event registration to intercept file uploads and print live data feedback
if (typeof window !== 'undefined') {
  window.addEventListener('statement-selected', async (event: any) => {
    const file = event.detail?.file
    if (!file) return

    const previewContainer = document.getElementById('preview-container')
    const textPreview = document.getElementById('text-preview')
    const uploadStatus = document.getElementById('upload-status')

    try {
      if (uploadStatus) uploadStatus.textContent = 'Extracting data items locally...'
      
      const parsedText = await extractTextFromPdf(file)
      
      if (textPreview && previewContainer) {
        textPreview.textContent = parsedText.trim() || 'No clear text content blocks found inside this document'
        previewContainer.classList.remove('hidden')
      }
      
      if (uploadStatus) uploadStatus.textContent = 'Extraction complete'
    } catch (error: any) {
      if (uploadStatus) uploadStatus.textContent = 'Error parsing document content'
      console.error(error)
    }
  })
}
