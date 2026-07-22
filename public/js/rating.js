// Star picker - lights up stars up to the chosen value.
const ratingInputs = document.querySelectorAll('input[name="rating"]');
const starButtons = document.querySelectorAll('.star-button');

function getSelectedRating() {
    for (const input of ratingInputs) {
        if (input.checked) return Number(input.value);
    }
    return 0;
}

function paintStars(value) {
    starButtons.forEach((star) => {
        star.classList.toggle('is-filled', Number(star.dataset.rating) <= value);
    });
}

ratingInputs.forEach((input) => {
    input.addEventListener('change', () => paintStars(Number(input.value)));
});

starButtons.forEach((star) => {
    star.addEventListener('mouseenter', () => paintStars(Number(star.dataset.rating)));
    star.addEventListener('mouseleave', () => paintStars(getSelectedRating()));
});

// Comment character counter - matches the database's 500 character limit.
const comment = document.querySelector('#comment');
const commentCount = document.querySelector('#comment-count');

function updateCommentCount() {
    commentCount.textContent = comment.value.length + ' / 500';
}

comment.addEventListener('input', updateCommentCount);
updateCommentCount();
