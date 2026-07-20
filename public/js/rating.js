const ratingMeanings = ['Not rated', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
const ratingInputs = [...document.querySelectorAll('input[name="rating"]')];
const starButtons = [...document.querySelectorAll('.star-button')];
const ratingMeaning = document.querySelector('#rating-meaning');
const comment = document.querySelector('#comment');
const commentCount = document.querySelector('#comment-count');
const voiceButton = document.querySelector('#voice-button');
const voiceStatus = document.querySelector('#voice-status');
const form = document.querySelector('#review-form');
const submitButton = document.querySelector('#submit-review');

// 根据当前数值点亮前 N 颗星，同时更新最右侧的英文评级含义。
function paintStars(value) {
    starButtons.forEach((star) => {
        const starValue = Number(star.dataset.rating);
        star.classList.toggle('is-filled', starValue <= value);
    });

    ratingMeaning.textContent = ratingMeanings[value] || ratingMeanings[0];
}

function getSelectedRating() {
    const selected = ratingInputs.find((input) => input.checked);
    return selected ? Number(selected.value) : 0;
}

ratingInputs.forEach((input) => {
    input.addEventListener('change', () => paintStars(Number(input.value)));
});

// 鼠标停留时预览星级；离开后恢复用户真正选择的数值。
starButtons.forEach((star) => {
    star.addEventListener('mouseenter', () => paintStars(Number(star.dataset.rating)));
    star.addEventListener('mouseleave', () => paintStars(getSelectedRating()));
});

paintStars(getSelectedRating());

// 实时显示评论字数，帮助用户遵守数据库 VARCHAR(500) 的限制。
function updateCommentCount() {
    commentCount.textContent = `${comment.value.length} / 500`;
}

comment.addEventListener('input', updateCommentCount);
updateCommentCount();

// 为刚选择的图片或视频创建本地预览，不需要先上传到服务器。
document.querySelectorAll('input[type="file"][data-preview-target]').forEach((input) => {
    input.addEventListener('change', () => {
        const preview = document.querySelector(`#${input.dataset.previewTarget}`);
        preview.replaceChildren();

        [...input.files].forEach((file) => {
            const figure = document.createElement('figure');
            const objectUrl = URL.createObjectURL(file);

            if (file.type.startsWith('image/')) {
                const image = document.createElement('img');
                image.src = objectUrl;
                image.alt = `Preview of ${file.name}`;
                image.addEventListener('load', () => URL.revokeObjectURL(objectUrl));
                figure.append(image);
            } else {
                const video = document.createElement('video');
                video.src = objectUrl;
                video.controls = true;
                video.preload = 'metadata';
                video.addEventListener('loadedmetadata', () => URL.revokeObjectURL(objectUrl));
                figure.append(video);
            }

            const caption = document.createElement('figcaption');
            caption.textContent = file.name;
            figure.append(caption);
            preview.append(figure);
        });
    });
});

// Web Speech API 主要由 Chrome/Edge 支持；不支持时禁用按钮并给出清楚提示。
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceStatus.textContent = 'Voice input is not supported in this browser.';
} else {
    const recognition = new SpeechRecognition();
    let isListening = false;

    recognition.lang = 'en-SG';
    recognition.continuous = false;
    recognition.interimResults = false;

    voiceButton.addEventListener('click', () => {
        if (isListening) {
            recognition.stop();
            return;
        }

        recognition.start();
    });

    recognition.addEventListener('start', () => {
        isListening = true;
        voiceButton.classList.add('is-listening');
        voiceButton.querySelector('span').textContent = 'Stop listening';
        voiceStatus.textContent = 'Listening… speak now.';
    });

    recognition.addEventListener('result', (event) => {
        const transcript = [...event.results]
            .map((result) => result[0].transcript)
            .join(' ')
            .trim();

        const separator = comment.value.trim() ? ' ' : '';
        comment.value = `${comment.value.trim()}${separator}${transcript}`.slice(0, 500);
        updateCommentCount();
        comment.focus();
    });

    recognition.addEventListener('end', () => {
        isListening = false;
        voiceButton.classList.remove('is-listening');
        voiceButton.querySelector('span').textContent = 'Voice input';
        voiceStatus.textContent = 'Speech added to your review.';
    });

    recognition.addEventListener('error', (event) => {
        voiceStatus.textContent = event.error === 'not-allowed'
            ? 'Microphone permission was not granted.'
            : 'Voice input stopped. Please try again.';
    });
}

// 提交后锁定按钮，避免视频上传期间用户重复点击产生重复请求。
form.addEventListener('submit', () => {
    submitButton.disabled = true;
    submitButton.querySelector('span').textContent = 'Saving review…';
});
