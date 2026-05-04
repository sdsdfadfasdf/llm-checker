/**
 * Hugging Face Integration Module
 *
 * Provides integration with Hugging Face Hub for model discovery,
 * evaluation, and runtime execution using transformers.js.
 */

const HuggingFaceClient = require('./hf-client');
const HuggingFaceScraper = require('./hf-scraper');
const HFNormalizer = require('./hf-normalizer');
const HFClassifier = require('./hf-classifier');
const HFDownloader = require('./hf-downloader');
const TransformersClient = require('./transformers-client');

module.exports = {
    HuggingFaceClient,
    HuggingFaceScraper,
    HFNormalizer,
    HFClassifier,
    HFDownloader,
    TransformersClient
};