import React from 'react';

const RecipeCard = ({ title, image, ingredients, steps, time, inspirationSource }) => {
  return (
    <div className="recipe-card">
      <img src={image} alt={title} className="recipe-image" />
      <div className="recipe-details">
        <h2 className="recipe-title">{title}</h2>
        <div className="recipe-ingredients">
          <h3>Ingredients:</h3>
          <ul>
            {ingredients.map((ingredient, index) => (
              <li key={index}>{ingredient}</li>
            ))}
          </ul>
        </div>
        <div className="recipe-steps">
          <h3>Steps:</h3>
          <ol>
            {steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
        <p className="recipe-time">Total time: {time}</p>
        <p href={inspirationSource} className="recipe-source">Inspiration source: {inspirationSource}</p>
      </div>
    </div>
  );
};

export default RecipeCard;