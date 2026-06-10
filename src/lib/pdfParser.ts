// This helper runs completely inside the browser viewport to scrape text layout blocks from a credit statement PDF
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
    
    // Concatenate individual text string elements captured across the statement viewport layer
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      
    fullText += pageText + '\n'
  }

  return fullText
}

// Global window event registration to intercept file uploads and run the asynchronous processing pipeline
if (typeof window !== 'undefined') {
  window.addEventListener('statement-selected', async (event: any) => {
    const file = event.detail?.file
    if (!file) return

    const previewContainer = document.getElementById('preview-container')
    const extractedRate = document.getElementById('extracted-rate')
    const extractedMinimum = document.getElementById('extracted-minimum')
    const uploadStatus = document.getElementById('upload-status')

    try {
      if (uploadStatus) uploadStatus.textContent = 'Extracting statement text locally...'
      
      const parsedText = await extractTextFromPdf(file)
      
      if (previewContainer && extractedRate && extractedMinimum) {
        extractedRate.textContent = 'Analysing rate text...'
        extractedMinimum.textContent = 'Analysing balance terms...'
        previewContainer.classList.remove('hidden')
      }
      
      // Dispatch a secondary custom event containing the raw scraped string text block
      // This sets up the exact execution context required for our regex token scrapers in Step 6.3
      const textReadyEvent = new CustomEvent('statement-text-ready', {
        detail: { text: parsedText }
      })
      window.dispatchEvent(textReadyEvent)
      
      if (uploadStatus) uploadStatus.textContent = 'Text extraction complete'
    } catch (error: any) {
      if (uploadStatus) uploadStatus.textContent = 'Error parsing credit document wrapper'
      console.error(error)
    }
  })
}
