from pathlib import Path
import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(page_title="Veridian IT Service Desk", layout="wide")

# Remove Streamlit's default padding so the app fills the page
st.markdown(
    "<style>.block-container{padding:1rem 0 0 0 !important;max-width:100% !important;}"
    "footer{visibility:hidden;}</style>",
    unsafe_allow_html=True,
)

html = (Path(__file__).parent / "veridian-it-service-agent.html").read_text(encoding="utf-8")
components.html(html, height=850, scrolling=False)